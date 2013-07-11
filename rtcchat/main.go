// Copyright 2013 Timur Mehrvarz. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

// rtcchat implements two services:
// - STUN over UDP
// - WebSocket signaling over https
//
// browse: https://(hostaddr):8077/rtcchat/

package main

import (
	"flag"
	"fmt"
	"github.com/mehrvarz/rtcchat"
	"os"
)

func main() {
	// note: values of stunport and sigport will be patched into "/rtcchat/rtcchat.js"
	var hostaddr = flag.String("hostaddr", "", "set host ip address")
	var stunport = flag.Int("stunport", 19253, "set STUNs port")
	var sigport = flag.Int("sigport", 8077, "set signaling port")
	var secure = flag.Bool("secure", true, "set false to allow signaling over http instead of https")
	var webroot = flag.String("webroot", "webroot", "set path to webroot")
	flag.Usage = func () {
		flag.PrintDefaults()
		os.Exit(0)
	}
	flag.Parse()

	// start STUN service
	go rtcchat.StunUDP(*hostaddr,*stunport)

	// start WebSocket signaling over https
	fmt.Println("secure",*secure)
	fmt.Println("webroot",*webroot)
	go rtcchat.RtcSignaling(*secure,*webroot,*sigport,*stunport)

	// let services run til aborted
	select {}
}

