const express = require("express");
const http = require("http");
const icecast = require("icecast-stack");
const ip = require("ip");
const lame = require("lame");
const stream = require("stream");

// 16-bit signed samples
const SAMPLE_SIZE = 16;
const CHANNELS = 2;
const SAMPLE_RATE = 44100;

const Server = function server(inputStream, opts) {
  const app = express();
  this.app = app;
  this.serverPort = false;
  this.inputStream = inputStream;
  app.disable("x-powered-by");

  const newOpts = opts;

  newOpts.name = newOpts.name || "Nicercast";

  const throttleStream = stream.PassThrough();
  this._internalStream = throttleStream; // eslint-disable-line no-underscore-dangle
  this.inputStream.pipe(throttleStream);

  // stream playlist (points to other endpoint)
  const playlistEndpoint = function playlistEndpoint(req, res) {
    const addr = ip.address();

    res.status(200);
    res.set("Content-Type", "audio/x-mpegurl");
    res.send(`http://${addr}:${this.serverPort}/listen`);
  }.bind(this);

  app.get("/", playlistEndpoint);
  app.get("/listen.m3u", playlistEndpoint);

  // audio endpoint
  // eslint-disable-next-line no-unused-vars
  app.get("/listen", (req, res, next) => {
    const acceptsMetadata = req.headers["icy-metadata"] === 1;

    // generate response header
    const headers = {
      "Content-Type": "audio/mpeg",
      Connection: "close"
    };

    if (acceptsMetadata) {
      headers["icy-metaint"] = 8192;
    }

    res.writeHead(200, headers);

    // setup metadata transport
    if (acceptsMetadata) {
      res = new icecast.IcecastWriteStack(res, 8192); // eslint-disable-line no-param-reassign
      res.queueMetadata(this.metadata || newOpts.name);
    }

    // setup encoder
    const encoder = new lame.Encoder({
      channels: CHANNELS,
      bitDepth: SAMPLE_SIZE,
      sampleRate: SAMPLE_RATE
    });

    let prevMetadata = 0;
    encoder.on("data", chunk => {
      if (acceptsMetadata && prevMetadata !== this.metadata) {
        res.queueMetadata(this.metadata || newOpts.name);
        prevMetadata = this.metadata;
      }

      res.write(chunk);
    });

    const callback = function cb(chunk) {
      encoder.write(chunk);
    };

    throttleStream.on("data", callback);

    req.connection.on("close", () => {
      encoder.end();
      throttleStream.removeListener("data", callback);
    });
  });
};

Server.prototype.start = function start(port, callback) {
  this.serverPort = port != null ? port : 0;
  this.server = http.createServer(this.app).listen(this.serverPort, () => {
    this.serverPort = this.server.address().port;

    if (callback && typeof callback === "function") {
      callback(this.serverPort);
    }
  });
};

Server.prototype.setInputStream = function setInputStream(inputStream) {
  this.inputStream.unpipe();
  this.inputStream = inputStream;
  this.inputStream.pipe(this._internalStream); // eslint-disable-line no-underscore-dangle
};

Server.prototype.setMetadata = function setMetadata(metadata) {
  this.metadata = metadata;
};

Server.prototype.stop = function stop() {
  try {
    this.server.close();
  } catch (err) {
    // Catch errors?
  }
};

module.exports = Server;
