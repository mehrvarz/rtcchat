// rtcchat rtcSignaling.go
// Copyright 2013 Timur Mehrvarz. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

package rtcchat

import (
	"code.google.com/p/go.net/websocket"
	"encoding/json"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"os"
	"text/template"
	"time"
)

var TAG = "RtcSignaling"

func RtcSignaling(secure bool, webroot string, sigport int, stunport int) {
	certFile := "keys/cert.pem"
	keyFile := "keys/key.pem"

	if secure {
		// make sure our https-keys are there
		_, err1 := os.Stat(certFile)
		if err1 != nil {
			fmt.Println(TAG, "missing", certFile)
			os.Exit(1)
		}

		_, err2 := os.Stat(keyFile)
		if err2 != nil {
			fmt.Println(TAG, "missing", keyFile)
			os.Exit(1)
		}
	}

	// make sure random is really random (for generateId())
	rand.Seed(time.Now().UnixNano())

	// handle serving the rtcchat.js template
	templFile := "/rtcchat.js"
	templFileUrl := fmt.Sprintf("/rtcchat%s", templFile)
	http.HandleFunc(templFileUrl, func(w http.ResponseWriter, r *http.Request) {
		fmt.Println(TAG, "serve template", r.URL.Path)
		if r.Method != "GET" {
			http.Error(w, "Method not allowed", 405)
			return
		}

		// patch sigport and stunport into rtcchat.js - if rtcchat.js is not modified
		// in production, move next two lines up above HandleFunc() for performance
		templFilePath := fmt.Sprintf("%s%s", webroot, templFile)
		homeTempl := template.Must(template.ParseFiles(templFilePath))

		type PatchInfo struct {
			SigPort  int
			StunPort int
		}
		patchInfo := PatchInfo{sigport, stunport}
		homeTempl.Execute(w, patchInfo)
	})

	// handle serving of static web content from the "static" folder
	http.Handle("/rtcchat/", http.StripPrefix("/rtcchat/", http.FileServer(http.Dir(webroot))))

	// handle signaling (matching two clients into one room by secret word)
	http.Handle("/ws", websocket.Handler(WsHandler))

	localAddr := fmt.Sprintf(":%d", sigport)
	if secure {
		// start https server and listen for incoming requests using our defined handlers
		fmt.Println(TAG, "ListenAndServeTLS", localAddr)
		err3 := http.ListenAndServeTLS(localAddr, certFile, keyFile, nil)
		if err3 != nil {
			fmt.Println(TAG, "fatal error ", err3.Error())
			os.Exit(1)
		}
	} else {
		// start http server and listen for incoming requests using our defined handlers
		fmt.Println(TAG, "ListenAndServe", localAddr)
		err3 := http.ListenAndServe(localAddr, nil)
		if err3 != nil {
			fmt.Println(TAG, "fatal error ", err3.Error())
			os.Exit(1)
		}
	}
}

// handle all client websockets sessions
func WsHandler(cws *websocket.Conn) {
	fmt.Println(TAG, "WsHandler start new client session...")
	done := make(chan bool)
	go WsSessionHandler(cws, done)
	<-done
}

type roomInfo struct {
	clientId string
	cws      *websocket.Conn
	users    int
}

// max number of concurrently open rooms
var maxOpenRooms = 1000
var roomInfoMap = make(map[string]roomInfo, maxOpenRooms)

// handle one complete websockets session
func WsSessionHandler(cws *websocket.Conn, done chan bool) {
	var myClientId string
	var roomName string
	var otherCws *websocket.Conn = nil

	err := websocket.Message.Send(cws, `{"command":"connect"}`)
	if err != nil {
		fmt.Println(TAG, "WsSessionHandler failed to send 'connect' state", err)
		done <- true
		return
	} 

	for {
		//fmt.Println(TAG,"WsSessionHandler waiting for command from client...")
		var msg map[string]string
		err := websocket.JSON.Receive(cws, &msg)
		//fmt.Printf("===%v\n", msg)
		if err != nil {
			if err == io.EOF {
				fmt.Println(TAG, "WsSessionHandler received EOF for myClientId=", myClientId)
				if otherCws != nil {
					// send presence=offline to otherCws
					websocket.Message.Send(otherCws, `{"command":"presence", "state":"offline"}`)
				}
			} else {
				fmt.Println(TAG, "WsSessionHandler can't receive for myClientId=", myClientId, err)
			}
			// graceful shutdown by server
			break
		}

		switch msg["command"] {
		case "connect":
			// create unique clientId
			myClientId = generateId()
			// send "ready" with unique clientId
			fmt.Println(TAG, "WsSessionHandler connect: send ready myClientId:", myClientId)
			err := websocket.Message.Send(cws, fmt.Sprintf(`{"command":"ready","clientId": "%s"}`, myClientId))
			if err != nil {
				fmt.Println(TAG, "WsSessionHandler connect: websocket.Message.Send err:", err)
			}

		case "subscribe":
			roomName = msg["room"]
			r, ok2 := roomInfoMap[roomName]
			if !ok2 {
				// no entry = 1st user in room: create new map entry (roomname -> clientid)
				fmt.Println(TAG, "WsSessionHandler subscribe: new room", roomName, "clientId=", myClientId)
				var r roomInfo
				r.clientId = myClientId
				r.cws = cws
				r.users = 1
				roomInfoMap[roomName] = r

				err1 := websocket.Message.Send(cws,
					fmt.Sprintf(`{"command":"roomclients", "room":"%s", "clients":[]}`, roomName))
				if err1 != nil {
					fmt.Println(TAG, "WsSessionHandler subscribe: websocket.Message.Send", err1)
				}

			} else {
				// 2nd user: send to same client: "roomclients" with array of clients in this room
				fmt.Println(TAG, "WsSessionHandler subscribe: existing room", roomName, "clientId=", myClientId)
				otherCws = r.cws
				r.cws = cws
				r.users = 2
				roomInfoMap[roomName] = r

				clientArray := fmt.Sprintf(`[{"clientId": "%s"}]`, r.clientId)
				err1 := websocket.Message.Send(cws,
					fmt.Sprintf(`{"command":"roomclients", "room":"%s", "clients":%s}`, roomName, clientArray))
				if err1 != nil {
					fmt.Println(TAG, "WsSessionHandler subscribe: websocket.Message.Send", err1)
					continue
				}

				// - send to other client in this room: "presence" with data.state ("online") + data.client
				fmt.Println(TAG, "WsSessionHandler subscribe: send presence online")
				clientInfo := fmt.Sprintf(`{"clientId":"%s"}`, myClientId)
				err2 := websocket.Message.Send(otherCws,
					fmt.Sprintf(`{"command":"presence", "state": "online", "client": %s}`, clientInfo))
				if err2 != nil {
					fmt.Println(TAG, "WsSessionHandler subscribe: websocket.Message.Send", err2)
					continue
				}
			}

		case "messageForward":
			// send "messageForward" and forward msg["data"]
			if otherCws == nil {
				// the 1st time user 1 does a messageForward, it does not yet know otherCws
				r, ok2 := roomInfoMap[roomName]
				if ok2 {
					otherCws = r.cws
				}
			}
			//fmt.Println(TAG,"WsSessionHandler messageForward: myClientId", myClientId)
			msg, err := json.Marshal(msg["message"])
			if err != nil {
				fmt.Println(TAG, "WsSessionHandler messageForward: json.Marshal err:", err)
				continue
			}
			var dd = fmt.Sprintf(`{"command":"messageForward", "message": %s}`, msg)
			//fmt.Println(TAG,"WsSessionHandler messageForward dd:",dd)
			err2 := websocket.Message.Send(otherCws, dd)
			if err2 != nil {
				fmt.Println(TAG, "WsSessionHandler messageForward: websocket.Message.Send err:", err2)
			}
		}
	}

	if roomName != "" {
		// the last user leaving the room must clean up
		r := roomInfoMap[roomName]
		if r.users > 0 {
			r.users--
		}
		if r.users > 0 {
			roomInfoMap[roomName] = r
		} else {
			fmt.Println(TAG, "WsSessionHandler delete room", roomName)
			delete(roomInfoMap, roomName)
		}
	}
	fmt.Println(TAG, "WsSessionHandler done myClientId", myClientId)
	done <- true
}

// unique id generator
func generateId() string {
	var S4 = func() string {
		return fmt.Sprintf("%x", ((1 + rand.Intn(0x10000)) | 0))[1:]
	}
	return (S4() + S4() + "-" + S4() + "-" + S4() + "-" + S4() + "-" + S4() + S4() + S4())
}
