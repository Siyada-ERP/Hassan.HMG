'use strict';
/* إرسال الإيميلات: SMTP مباشر (بدون مكتبات). لو SMTP مش متظبط الرسائل بتتكتب في data/outbox وفي شاشة السيرفر. */
const net = require('net'), tls = require('tls'), fs = require('fs'), path = require('path');
const cfg = require('./config');

const b64 = s => Buffer.from(s, 'utf8').toString('base64');
const wrap76 = s => s.replace(/(.{76})/g, '$1\r\n');
const hdrEnc = s => (/^[\x20-\x7e]*$/.test(s) ? s : '=?UTF-8?B?' + b64(s) + '?=');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function buildMessage(from, to, subject, text, html) {
  const id = require('crypto').randomBytes(12).toString('hex') + '@siyada';
  const bd = 'sy_' + require('crypto').randomBytes(8).toString('hex');
  const fromAddr = /<([^>]+)>/.exec(from) ? /<([^>]+)>/.exec(from)[1] : from;
  const fromName = from.replace(/<[^>]+>/, '').trim();
  const lines = [
    'From: ' + (fromName ? hdrEnc(fromName) + ' <' + fromAddr + '>' : fromAddr), 'To: ' + to, 'Subject: ' + hdrEnc(subject), 'Date: ' + new Date().toUTCString(),
    'Message-ID: <' + id + '>', 'MIME-Version: 1.0', 'Content-Type: multipart/alternative; boundary="' + bd + '"', '',
    '--' + bd, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', wrap76(b64(text)),
    '--' + bd, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', wrap76(b64(html)), '--' + bd + '--', ''
  ];
  return { fromAddr, data: lines.join('\r\n') };
}

function smtpSend(c, to, msg) {
  return new Promise((resolve, reject) => {
    let sock, buf = '', waiter = null, done = false, stage = 'connect';
    const fail = e => { if (done) return; done = true; try { sock && sock.destroy(); } catch (x) { } reject(e instanceof Error ? e : new Error(String(e))); };
    const timer = setTimeout(() => fail(new Error('SMTP timeout at ' + stage)), 25000);
    const finish = () => { if (done) return; done = true; clearTimeout(timer); try { sock.end(); } catch (x) { } resolve(true); };
    const onData = d => {
      buf += d.toString('utf8');
      for (; ;) { // رد كامل = آخر سطر فيه رمز من 3 أرقام + مسافة
        const lines = buf.split('\r\n'); if (lines.length < 2) return;
        const full = lines.slice(0, -1); const last = full[full.length - 1];
        if (/^\d{3}-/.test(last)) { if (!/\r\n$/.test(buf)) return; }
        let end = -1; for (let i = 0; i < full.length; i++) if (/^\d{3} /.test(full[i]) || /^\d{3}$/.test(full[i])) { end = i; break; }
        if (end < 0) return;
        const resp = full.slice(0, end + 1); buf = lines.slice(end + 1).join('\r\n');
        const w = waiter; waiter = null; if (w) w({ code: parseInt(resp[end].slice(0, 3), 10), lines: resp });
      }
    };
    const read = () => new Promise(r => { waiter = r; if (buf.indexOf('\r\n') >= 0) onData(''); });
    const cmd = async (line, ok) => { stage = line.split(' ')[0]; if (line) sock.write(line + '\r\n'); const r = await read(); if (ok && ![].concat(ok).includes(r.code)) throw new Error('SMTP ' + stage + ' → ' + r.lines.join(' | ')); return r; };
    const attach = s => { sock = s; s.on('data', onData); s.on('error', fail); s.on('close', () => { if (!done) fail(new Error('SMTP closed at ' + stage)); }); };
    (async () => {
      const opts = { host: c.host, port: c.port, servername: c.host, rejectUnauthorized: c.rejectUnauthorized };
      await new Promise((res, rej) => { const s = c.secure ? tls.connect(opts, res) : net.connect({ host: c.host, port: c.port }, res); s.once('error', rej); attach(s); });
      const g = await read(); if (g.code !== 220) throw new Error('SMTP greeting ' + g.lines.join(' '));
      let r = await cmd('EHLO siyada.local', 250);
      if (!c.secure && c.starttls && r.lines.some(l => /STARTTLS/i.test(l))) {
        await cmd('STARTTLS', 220);
        sock.removeAllListeners('data'); sock.removeAllListeners('close'); sock.removeAllListeners('error'); buf = '';
        const raw = sock; const ts = await new Promise((res, rej) => { const t2 = tls.connect({ socket: raw, servername: c.host, rejectUnauthorized: c.rejectUnauthorized }, () => res(t2)); t2.once('error', rej); });
        attach(ts); r = await cmd('EHLO siyada.local', 250);
      }
      if (c.user) {
        const mech = r.lines.join(' ');
        if (/AUTH[^\r\n]*PLAIN/i.test(mech) || !/AUTH[^\r\n]*LOGIN/i.test(mech)) await cmd('AUTH PLAIN ' + b64('\0' + c.user + '\0' + c.pass), 235);
        else { await cmd('AUTH LOGIN', 334); await cmd(b64(c.user), 334); await cmd(b64(c.pass), 235); }
      }
      await cmd('MAIL FROM:<' + msg.fromAddr + '>', 250);
      await cmd('RCPT TO:<' + to + '>', [250, 251]);
      await cmd('DATA', 354);
      sock.write(msg.data.replace(/^\./gm, '..') + '\r\n.\r\n'); stage = 'DATA-end';
      const e = await read(); if (e.code !== 250) throw new Error('SMTP DATA → ' + e.lines.join(' | '));
      try { sock.write('QUIT\r\n'); } catch (x) { }
      finish();
    })().catch(fail);
  });
}

async function sendMail(to, subject, text, html, link) {
  if (cfg.smtp) {
    try { await smtpSend(cfg.smtp, to, buildMessage(cfg.smtp.from, to, subject, text, html)); return { sent: true }; }
    catch (e) { console.error('[mail] فشل إرسال إيميل إلى ' + to + ': ' + e.message); /* نكمل ونكتبه في outbox */ }
  }
  try {
    const dir = path.join(cfg.dataDir, 'outbox'); fs.mkdirSync(dir, { recursive: true });
    const f = path.join(dir, Date.now() + '-' + to.replace(/[^a-z0-9@._-]/gi, '_') + '.txt');
    fs.writeFileSync(f, 'To: ' + to + '\nSubject: ' + subject + '\n\n' + text + '\n', { mode: 0o600 });
  } catch (e) { }
  console.log('[mail] (SMTP غير متظبط أو فشل) إلى ' + to + ' — ' + subject + (link ? '\n        الرابط: ' + link : ''));
  return { sent: false };
}

const wrapHtml = (title, body, btn, link) => '<!doctype html><html lang="ar" dir="rtl"><body style="margin:0;background:#f4f6f5;font-family:Tahoma,Arial,sans-serif;direction:rtl"><div style="max-width:520px;margin:24px auto;background:#fff;border:1px solid #dfe5e2;border-radius:10px;overflow:hidden"><div style="background:#14463a;color:#fff;padding:16px 22px;font-size:20px;font-weight:bold;letter-spacing:1px">SIYADA</div><div style="padding:22px;line-height:1.9;color:#1b2a25"><h2 style="margin:0 0 10px;font-size:18px">' + esc(title) + '</h2>' + body + (link ? '<p style="margin:22px 0"><a href="' + esc(link) + '" style="background:#14463a;color:#fff;text-decoration:none;padding:11px 22px;border-radius:7px;display:inline-block">' + esc(btn) + '</a></p><p style="font-size:12px;color:#6b7a74;word-break:break-all">لو الزر مش شغال انسخ الرابط ده في المتصفح:<br>' + esc(link) + '</p>' : '') + '</div></div></body></html>';

const T = {
  verify: (link) => ({ subject: 'فعّل حسابك في SIYADA', text: 'أهلاً بيك في SIYADA.\nافتح الرابط ده عشان تفعّل الإيميل بتاعك:\n' + link + '\n\nالرابط صالح ٤٨ ساعة.', html: wrapHtml('فعّل حسابك', '<p>أهلاً بيك في SIYADA. اضغط الزر لتفعيل الإيميل بتاعك. الرابط صالح ٤٨ ساعة.</p>', 'تفعيل الحساب', link), link }),
  reset: (link) => ({ subject: 'استرجاع كلمة المرور — SIYADA', text: 'وصلنا طلب لتغيير كلمة المرور. افتح الرابط:\n' + link + '\n\nالرابط صالح ساعة واحدة. لو ما طلبتش ده تجاهل الرسالة.', html: wrapHtml('استرجاع كلمة المرور', '<p>وصلنا طلب لتغيير كلمة المرور. الرابط صالح ساعة واحدة. لو ما طلبتش ده تجاهل الرسالة.</p>', 'تغيير كلمة المرور', link), link }),
  invite: (link, company, role, by) => ({ subject: 'دعوة للانضمام إلى ' + company + ' على SIYADA', text: by + ' دعاك تنضم لشركة «' + company + '» بصلاحية ' + role + ' على SIYADA.\nافتح الرابط:\n' + link + '\n\nالدعوة صالحة ٧ أيام.', html: wrapHtml('دعوة للانضمام', '<p><b>' + esc(by) + '</b> دعاك تنضم لشركة <b>' + esc(company) + '</b> بصلاحية <b>' + esc(role) + '</b>. الدعوة صالحة ٧ أيام.</p>', 'قبول الدعوة', link), link })
};
module.exports = { sendMail, T, buildMessage };
