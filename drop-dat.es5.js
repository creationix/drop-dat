#!/usr/bin/env node
'use strict';

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var hyperdrive = _interopDefault(require('hyperdrive'));
var swarm = _interopDefault(require('hyperdiscovery'));
var ram = _interopDefault(require('random-access-memory'));
var minimist = _interopDefault(require('minimist'));
var fs = require('fs');
var path = require('path');
var promisey = require('promisey');

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

    // Add some files to it.
    console.log('Importing file(s)...');
    for (let name of argv._) {
      let fullPath = path.resolve(process.cwd(), name);
      console.log(`Adding ${fullPath}...`);
      yield promisey.M(archive, 'writeFile', name, (yield promisey.F(fs.readFile, fullPath)));
    }
    var sw = swarm(archive);
    sw.on('connection', function (peer, type) {
      console.log('Found swarm peer', peer, type);
    });
    console.log(`Ready to share: dat://${archive.key.toString('hex')}`);

    // Keep the event loop alive forever.
    console.log('Press Control+C to stop sharing');
    process.stdin.resume();
  });

  return function main(_x) {
    return _ref.apply(this, arguments);
  };
})();

main(minimist(process.argv.slice(2))).catch(err => {
  console.error(err.stack);
  return process.exit(1);
});
