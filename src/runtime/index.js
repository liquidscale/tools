/*
    MIT License

    Copyright (c) 2021 Covistra Technologies Inc.

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.
*/
const express = require("express");

module.exports = function runtimeFactory(cfg = {}) {
  const app = express();
  require("express-ws")(app);

  app.ws("/", function (ws) {
    ws.on("message", async function (msg) {
      console.log("received message", msg);
    });
  });

  // register all system scopes
  // world (org?)
  // security scope (backed  by simple yaml file)
  //
  // register all test components

  // runtime api
  return {
    async start() {
      app.listen(cfg.port || 9000, function (err) {
        if (err) {
          return console.error(err.message.red);
        }
        console.log("virtual cluster started exposing websocket gateway on port %d".green, cfg.port || 9000);
      });
    },
  };
};
