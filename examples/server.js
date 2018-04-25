const NicerCast = require("../index.js");

const server = new NicerCast(process.stdin, {});
server.start();

let x = 0;
setInterval(() => {
  server.setMetadata(`Test Metadata ${(x += 1)}`);
}, 1000);
