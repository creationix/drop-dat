#!/usr/bin/env node
'use strict';

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var hyperdrive = _interopDefault(require('hyperdrive'));
var swarm = _interopDefault(require('hyperdiscovery'));
var ram = _interopDefault(require('random-access-memory'));
var minimist = _interopDefault(require('minimist'));
var pump = _interopDefault(require('pump'));
var hyperdriveHttp = _interopDefault(require('hyperdrive-http'));
var websocket = _interopDefault(require('websocket-stream'));
var fs = require('fs');
var path = require('path');
var promisey = require('promisey');
var http = require('http');

var asyncGenerator = function () {
  function AwaitValue(value) {
    this.value = value;
  }

  function AsyncGenerator(gen) {
    var front, back;

    function send(key, arg) {
      return new Promise(function (resolve$$1, reject) {
        var request = {
          key: key,
          arg: arg,
          resolve: resolve$$1,
          reject: reject,
          next: null
        };

        if (back) {
          back = back.next = request;
        } else {
          front = back = request;
          resume(key, arg);
        }
      });
    }

    function resume(key, arg) {
      try {
        var result = gen[key](arg);
        var value = result.value;

        if (value instanceof AwaitValue) {
          Promise.resolve(value.value).then(function (arg) {
            resume("next", arg);
          }, function (arg) {
            resume("throw", arg);
          });
        } else {
          settle(result.done ? "return" : "normal", result.value);
        }
      } catch (err) {
        settle("throw", err);
      }
    }

    function settle(type, value) {
      switch (type) {
        case "return":
          front.resolve({
            value: value,
            done: true
          });
          break;

        case "throw":
          front.reject(value);
          break;

        default:
          front.resolve({
            value: value,
            done: false
          });
          break;
      }

      front = front.next;

      if (front) {
        resume(front.key, front.arg);
      } else {
        back = null;
      }
    }

    this._invoke = send;

    if (typeof gen.return !== "function") {
      this.return = undefined;
    }
  }

  if (typeof Symbol === "function" && Symbol.asyncIterator) {
    AsyncGenerator.prototype[Symbol.asyncIterator] = function () {
      return this;
    };
  }

  AsyncGenerator.prototype.next = function (arg) {
    return this._invoke("next", arg);
  };

  AsyncGenerator.prototype.throw = function (arg) {
    return this._invoke("throw", arg);
  };

  AsyncGenerator.prototype.return = function (arg) {
    return this._invoke("return", arg);
  };

  return {
    wrap: function (fn) {
      return function () {
        return new AsyncGenerator(fn.apply(this, arguments));
      };
    },
    await: function (value) {
      return new AwaitValue(value);
    }
  };
}();



var asyncToGenerator = function (fn) {
  return function () {
    var gen = fn.apply(this, arguments);
    return new Promise(function (resolve$$1, reject) {
      function step(key, arg) {
        try {
          var info = gen[key](arg);
          var value = info.value;
        } catch (error) {
          reject(error);
          return;
        }

        if (info.done) {
          resolve$$1(value);
        } else {
          return Promise.resolve(value).then(function (value) {
            step("next", value);
          }, function (err) {
            step("throw", err);
          });
        }
      }

      return step("next");
    });
  };
};

let main = (() => {
  var _ref = asyncToGenerator(function* (argv) {
    let importList = (() => {
      var _ref2 = asyncToGenerator(function* (base, names) {
        for (let name of names) {
          let path$$1 = path.join(base, name);
          let fullPath = path.resolve(cwd, path$$1);
          let meta = yield promisey.F(fs.stat, fullPath);
          if (meta.isDirectory()) {
            let children = yield promisey.F(fs.readdir, fullPath);
            yield importList(path$$1, children.filter(function (name) {
              return name[0] !== '.';
            }));
          }
          if (meta.isFile()) {
            console.error(`  ${path$$1}`);
            yield promisey.M(archive, 'writeFile', path$$1, (yield promisey.F(fs.readFile, fullPath)));
          }
        }
      });

      return function importList(_x2, _x3) {
        return _ref2.apply(this, arguments);
      };
    })();

    // Run a server if the `--serve` option is given
    if (argv.serve) return serve(argv.serve === true ? DEFAULT_PORT : argv.serve);

    if (!argv._.length) {
      console.error('Usage: drop-dat files...');
      return process.exit(2);
    }

    // Create a new in-memory hyperdrive
    let archive = hyperdrive(function (name) {
      return ram();
    });

    // Wait for it to be ready
    yield promisey.E(archive, 'ready');

    console.error('Importing file(s):');
    let cwd = process.cwd();
    yield importList('.', argv._);

    if (argv.upload) return upload(archive, argv.upload);
    console.error('Sharing on P2P network');
    return share(archive);
  });

  return function main(_x) {
    return _ref.apply(this, arguments);
  };
})();

let share = (() => {
  var _ref3 = asyncToGenerator(function* (archive) {
    var sw = swarm(archive);
    sw.on('connection', function (peer, type) {
      console.error('Found swarm peer.');
    });
    console.error('Sharing on dat P2P network...');
    console.error('Press Control+C to stop sharing.\n');
    console.log(`dat://${archive.key.toString('hex')}`);

    // Keep the event loop alive forever.
    process.stdin.resume();
  });

  return function share(_x4) {
    return _ref3.apply(this, arguments);
  };
})();

let upload = (() => {
  var _ref4 = asyncToGenerator(function* (archive, url) {
    if (url === true) url = 'localhost';
    if (typeof url === 'number') url = 'localhost:' + url;
    let [host, port = DEFAULT_PORT] = url.split(':');
    let socket = websocket(`ws://${host}:${port}/`);
    yield promisey.E(socket, 'connect');
    console.error('Connected to Server, uploading...');
    yield promisey.M(socket, 'write', archive.key);
    console.log(`http://${host}:${port}/${archive.key.toString('hex')}/`);
    archive.content.on('upload', function (index) {
      console.log('Upload', index);
    });
    yield promisey.F(pump, socket, archive.replicate({ upload: true, live: true }), socket);
  });

  return function upload(_x5, _x6) {
    return _ref4.apply(this, arguments);
  };
})();

let serve = (() => {
  var _ref5 = asyncToGenerator(function* (port) {
    let handleClient = (() => {
      var _ref6 = asyncToGenerator(function* (socket) {
        let key;
        while (true) {
          key = socket.read(32);
          if (key) break;
          yield promisey.E(socket, 'readable');
        }
        let hex = key.toString('hex');
        let archive = hyperdrive(function (name) {
          return ram();
        }, key, { sparse: true });

        yield promisey.E(archive, 'ready');

        console.log(`Added site dat://${hex}`);
        sites[hex] = hyperdriveHttp(archive);
        try {
          yield promisey.F(pump, socket, archive.replicate(), socket);
        } catch (err) {
          if (!err.message.match(/premature close/)) throw err;
        } finally {
          console.log('Removed site', hex);
          delete sites[hex];
        }
      });

      return function handleClient(_x8) {
        return _ref6.apply(this, arguments);
      };
    })();

    let sites = {};

    let server = http.createServer(function (req, res) {
      // See if the request matches
      let match = req.url.match(/\/([0-9a-f]{64})\//);
      let site = match && sites[match[1]];
      if (!site) return res.writeHead(404);
      req.url = req.url.replace(match[0], '/');
      return site(req, res);
    }).listen(port);

    websocket.createServer({ server }, function (stream) {
      handleClient(stream).catch(function (err) {
        console.error(err.stack);
      });
    });

    console.log(`Proxy Server running at http://localhost:${port}/:key/`);
    console.log(`Upload interface at ws://localhost:${port}/`);
  });

  return function serve(_x7) {
    return _ref5.apply(this, arguments);
  };
})();

const DEFAULT_PORT = parseInt(process.env.PORT || '0') || 8040;

main(minimist(process.argv.slice(2))).catch(err => {
  console.error(err.stack);
  return process.exit(1);
});
