// rtcchat stun.go
// Copyright 2013 Timur Mehrvarz. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

package rtcchat

import (
	"encoding/binary"
	"fmt"
	"net"
	"os"
)

func StunUDP(hostaddr string, port int) {
	var TAG = "StunUDP"

	// start listen to UDP port
	udpAddr := fmt.Sprintf(":%d", port)
	fmt.Println(TAG, "ResolveUDPAddr "+udpAddr)
	laddr, err := net.ResolveUDPAddr("udp4", udpAddr)
	if err != nil {
		fmt.Println("Resolve error", err)
		os.Exit(1)
	}
	fmt.Println(TAG, "ListenUDP laddr=", laddr)
	c, erl := net.ListenUDP("udp", laddr)
	if erl != nil {
		fmt.Println(TAG, "Listen error", erl)
		os.Exit(1)
	}

	// find out what ip4 host address to advertise
	localHost := hostaddr + ":0"
	if hostaddr == "" {
		// no address given by command line
		hostname, err := os.Hostname()
		if err != nil {
			fmt.Println(TAG, "Oops:", err)
			os.Exit(1)
		}
		fmt.Println(TAG, "Hostname", hostname)
		addrs, err := net.LookupHost(hostname)
		if err != nil {
			fmt.Println(TAG, "Oops:", err)
			os.Exit(1)
		}
		for _, a := range addrs {
			fmt.Println(TAG, "range addrs", a)
			localHost = fmt.Sprintf("%s:0", a)
		}
	}
	fmt.Println(TAG, "localHost", localHost)

	// get the localHost address into an IP4 byte array
	localHostAddr, ert := net.ResolveTCPAddr("tcp", localHost)
	if ert != nil {
		fmt.Println("Resolve localHost error", ert)
		os.Exit(1)
	}
	hostLocalAddrIP4 := localHostAddr.IP.To4()
	fmt.Println(TAG, "hostLocalAddrIP4",
		hostLocalAddrIP4[0], hostLocalAddrIP4[1], hostLocalAddrIP4[2], hostLocalAddrIP4[3])

	// start forever service loop
	for {
		//fmt.Println(TAG,"Read...",c.LocalAddr().String())
		var buf [256]byte
		l, addr, erd := c.ReadFromUDP(buf[0:34])
		if erd != nil {
			fmt.Println("Read error", erd)
			os.Exit(1)
		}
		clientRemoteAddrIP4 := addr.IP.To4()
		fmt.Println(TAG, "conn addr IP=", clientRemoteAddrIP4, len(clientRemoteAddrIP4))
		//fmt.Println(TAG,"Read len",l,"\n",hex.Dump(buf[0:l]))  // import "encoding/hex"
		if l <= 10 {
			// something is wrong with the request
			continue
		}

		// create udp response
		var respBuf [80]byte
		respBuf[0] = 0x01
		respBuf[1] = 0x01
		respBuf[2] = 0x00
		for i := 4; i < 20; i++ {
			respBuf[i] = buf[i]
		}
		idx := 20

		// MAPPED ADDR - to indicate the source IP and source port the server saw in the Binding request
		respBuf[idx] = 0x00
		respBuf[idx+1] = 0x01
		respBuf[idx+2] = 0x00
		respBuf[idx+3] = 0x08
		respBuf[idx+4] = 0x00
		respBuf[idx+5] = 0x01
		// client public port
		respBuf[idx+6] = byte(addr.Port >> 8)
		respBuf[idx+7] = byte(addr.Port & 255)
		// client public addr
		respBuf[idx+8] = clientRemoteAddrIP4[0]
		respBuf[idx+9] = clientRemoteAddrIP4[1]
		respBuf[idx+10] = clientRemoteAddrIP4[2]
		respBuf[idx+11] = clientRemoteAddrIP4[3]
		idx += 12

		// SOURCE_ADDRESS - to indicate if twice NAT configurations are being used
		respBuf[idx] = 0x00
		respBuf[idx+1] = 0x04
		respBuf[idx+2] = 0x00
		respBuf[idx+3] = 0x08
		respBuf[idx+4] = 0x00
		respBuf[idx+5] = 0x01
		// host public port
		respBuf[idx+6] = byte(port >> 8)
		respBuf[idx+7] = byte(port & 255)
		// host public addr
		respBuf[idx+8] = hostLocalAddrIP4[0]
		respBuf[idx+9] = hostLocalAddrIP4[1]
		respBuf[idx+10] = hostLocalAddrIP4[2]
		respBuf[idx+11] = hostLocalAddrIP4[3]
		idx += 12

		// CHANGED ADDR
		// to indicate the IP address and port where the response would have been sent from
		// if the client requests a “Change IP” and “Change Port” in a “CHANGE-REQUEST” attribute
		respBuf[idx] = 0x00
		respBuf[idx+1] = 0x05
		respBuf[idx+2] = 0x00
		respBuf[idx+3] = 0x08
		respBuf[idx+4] = 0x00
		respBuf[idx+5] = 0x01
		// non existing port
		respBuf[idx+6] = byte(0)
		respBuf[idx+7] = byte(0)
		// empty addr
		respBuf[idx+8] = byte(0)
		respBuf[idx+9] = byte(0)
		respBuf[idx+10] = byte(0)
		respBuf[idx+11] = byte(0)
		idx += 12

		// XOR-MAPPED-ADDRESS
		// to indicate the IP address and port where the response would have been sent from
		// if the client requests a “Change IP” and “Change Port” in a “CHANGE-REQUEST” attribute
		respBuf[idx] = 0x80
		respBuf[idx+1] = 0x20
		respBuf[idx+2] = 0x00
		respBuf[idx+3] = 0x08
		respBuf[idx+4] = 0x00
		respBuf[idx+5] = 0x01
		// xored client public port
		magic := binary.BigEndian.Uint16(buf[4:6])
		xor_port := uint16(addr.Port) ^ magic
		//fmt.Printf("StunUDP magic=%#x port=%#x xor_port=%#x\n",magic,addr.Port,xor_port)
		respBuf[idx+6] = byte(xor_port >> 8)
		respBuf[idx+7] = byte(xor_port & 255)
		// xored host public addr
		fullmagic := binary.BigEndian.Uint32(buf[4:8])
		xor_addr := binary.BigEndian.Uint32(clientRemoteAddrIP4[0:4]) ^ fullmagic
		//fmt.Printf("StunUDP fullmagic=%#x clientRemoteAddrIP4=%#x xor_addr=%#x\n",fullmagic,clientRemoteAddrIP4,xor_addr)
		respBuf[idx+8] = byte(xor_addr >> 24)
		respBuf[idx+9] = byte(xor_addr >> 16)
		respBuf[idx+10] = byte(xor_addr >> 8)
		respBuf[idx+11] = byte(xor_addr)
		idx += 12

		// SOFTWARE
		softwareString := "tm-soft " // note: length must be 4-byte aligned!
		softwareStringLen := len(softwareString)
		respBuf[idx] = 0x80
		respBuf[idx+1] = 0x22
		respBuf[idx+2] = 0x00
		respBuf[idx+3] = byte(softwareStringLen)
		softwareByteArray := []byte(softwareString)
		for i := 0; i < softwareStringLen; i++ {
			respBuf[idx+4+i] = softwareByteArray[i]
		}
		idx += (4 + softwareStringLen)

		// the resulting attachment length
		respBuf[3] = byte(idx - 20)

		//fmt.Println(TAG,"write len",idx,"\n",hex.Dump(respBuf[0:idx]))  // import "encoding/hex"
		_, ere := c.WriteTo(respBuf[0:idx], addr)
		if ere != nil {
			fmt.Println(TAG, "write error", ere)
		} else {
			//fmt.Println(TAG,"written len",wlen)
		}
	}
}
