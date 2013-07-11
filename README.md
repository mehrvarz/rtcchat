rtc chat
========

A WebRTC peer-to-peer chat service written in Go

rtcchat helps two browsers establish a direct p2p data link.

Q: What does it take to connect two browsers, both behind NAT?<br/> 
A: One secret word.

<img style="margin-left:0px" src="rtcchat.png" /><br/>

rtc chat works with [Firefox 22+](http://getfirefox.com/) on the Desktop and with [Firefox 25+ on Android](http://ftp.mozilla.org/pub/mozilla.org/mobile/nightly/latest-mozilla-central-android/).

Try it out: [live rtcchat](http://timur.mobi/rtcchat/) (site is using a self-signed certificate for https)

How does it work
----------------

- your browser will fetch the rtc chat web app and will switch to https
- the secret word you enter will be sent to the rtc chat server 
- because noone else is using your secret word currently, you have to wait
- the STUN service on the rtc chat server has already provided you with your public ip address
- now someone else is starting to use rtc chat and is entering the same secret word
- rtc chat will immediately provide your browser with this info, WebRTC signaling will now start
- your browser will generated a WebRTC offer and will send it to the rtc chat server
- rtc chat server will forward your WebRTC offer to the other party
- the other party will respond by sending back a WebRTC answer 
- as soon as your browser has received the WebRTC answer it will kill the server connection
- a direct p2p WebRTC will now be established
- p2p communication are done over encrypted, reliable UDP

What is special
---------------

Two things!

1. Unlike other WebRTC solutions, the rtcchat client will NOT instruct your device 
to contact any 3rd party servers, say, in order to retrieve your devices own public IP address.
rtcchat comes with it's own STUN and signaling services.

2. Installation couldn't be easier. rtc chat server is 100% selfcontained (it's a single 
executable). And there are no requirements to install any programming languages or 3rd party frameworks. 

Run precompiled executable
--------------------------

	mkdir rtcchat
	cd rtcchat

1. Download one of the precompiled executable binaries for your platform from: 
[http://github.com/mehrvarz/files](http://github.com/mehrvarz/files)
(click 'Raw')

2. Download the platform neutral web application:
[https://github.com/mehrvarz/files/raw/master/rtcchat-webroot.zip](https://github.com/mehrvarz/files/raw/master/rtcchat-webroot.zip)

3. Unzip both archives into one folder.

4. Create keys for WebSocket signaling over https (see below).
Or run your executable with option: -secure=false

This is how your rtcchat folder should look:

	rtcchat
		webroot
			index.html
			rtcchat.js
			adapter.js
			bootstrap.min.css
			...
		keys
			key.pem
			cert.pem
		rtcchat-darwin-amd64

5. Now you can run the executable:

	./rtcchat{-os-platform} [-options]

Run from source
---------------

Golang 1.1 needs to be installed.

	go get github.com/mehrvarz/rtcchat
	cd $GOPATH/src/github.com/mehrvarz/rtcchat

Create keys for WebSocket signaling over https (see below) or add option: -secure=false

Now you can run the main package:

	go run rtcchat/main.go [-options]

Server command line options
---------------------------

This tables shows command line options with their default values:

	-hostaddr="": set host ip address
	-sigport=8077: set signaling port
	-stunport=19253: set STUNs port
	-secure=true: set to false to allow signaling over http instead of https
	-webroot="webroot": set path to webroot

Create keys for WebSocket signaling over https
----------------------------------------------

	mkdir keys && cd keys
	openssl req -new -x509 -nodes -out cert.pem -keyout key.pem -days 100
	(answer questions)
	cd ..

Alternative: link to your existing keys froms /etc/nginx

	mkdir keys && cd keys
	ln -s /etc/nginx/cert.pem cert.pem
	ln -s /etc/nginx/key.pem key.pem
	cd ..

Please note: the "keys" subfolder is expected to contain two files: "cert.pem" and "key.pem".

Establish p2p connection
------------------------

Open two instances of Firefox and browse to: 

	https://{hostaddr}:8077/rtcchat

License
-------

This project uses code from:

bootstrap.js: Copyright 2012 Twitter, Inc; Apache License, Version 2.0.<br/>
jquery: Copyright jQuery Foundation and contributors; MIT License.<br/>
adapter.js: Copyright 2013 Chris Ball <chris@printf.net>.<br/>

For the rest:

Copyright (C) 2013 Timur Mehrvarz

Permission is hereby granted, free of charge, to any person obtaining a
copy of serverless-webrtc and associated documentation files (the "Software"),
to deal in the Software without restriction, including without limitation the
rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
sell copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

