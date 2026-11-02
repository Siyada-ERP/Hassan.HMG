FROM node:26-slim
WORKDIR /app
COPY package.json server.js cli.js ./
COPY lib ./lib
COPY public ./public
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DATA_DIR=/data
RUN mkdir -p /data && chown -R node:node /data /app
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
