# drop-dat
A quick file sharing mechanism using dat libraries.

## HTTP Proxy

On a machine with a public address (raw IP address or domain is fine), install `drop-dat` and setup a gateway service.

```sh
npm i -g drop-dat
drop-dat --serve
```

On your machine that has the source files, upload a folder to the gateway server.

As long as this process is connected to the gateway, it will host the files over http.

```
tims-imac:exploder tim$ drop-dat . --upload daplie.rocks
Importing file(s):
  README.markdown
  app.js
  apple-touch-icon.png
  dat.json
  favicon.ico
  icon-128.png
  index.html
  manifest.appcache
  manifest.webapp
  pixi.min.js
  pixi.min.js.map
  resources/sprites.svg
  sprites.json
  sprites.png
  style.css
Connected to Server, uploading...
http://daplie.rocks:8040/25fe50776dfb446e856e31ff229131472928875010f1185ff187f46be7e9f3fb/
```

Go to the url in a browser and enjoy dat over http!

When you're done, just Control+C the upload client and the server will deregister the site.

Everything was in memory and nothing is touched on your disk.

## P2P Mode

If you want to share with someone that has a dat client already (like Beaker Browser),
this can be used to share quick and temporary dats of single files.

```sh
tims-imac:exploder tim$ drop-dat README.markdown
Importing file(s):
  README.markdown
Sharing on P2P network
Sharing on dat P2P network...
Press Control+C to stop sharing.

dat://7c5adb14a4afaaa9e8f7d2fa4e7c567f3b6b63ba4c6f336d04e780fa0f0740ce
```

Then on the other side, open the url in Beaker or Dat desktop or whatever.
