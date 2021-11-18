# Netcat Commander

If you have ever used Metasploit `msfconsole` and its `use multi/handler` command, this is a stand-alone version of that.

## Why not Metasploit then?
- I like not being dependent on Metasploit for anything. Also, the OSCP certification forbids its use on the exam.
- Metasploit's handler is crashy. For example, if you end any command with `\"` (ie. `cd "C:\Program Files\"` ) it will crash the process and you lose all your sessions.
- Metasploit's handler does a behind-the-scenes handshake/test with every new connection by sending an `echo <RANDOM_HASH>` and expecting to receive it back in response. If any session fails this test, it will not accept the connection. Instead I prefer to be able to send literally ANY data or protocol, and have it guaranteed accepted and buffered accordingly. Likewise, if even a brief attempt to connect is received, I like to see a log message about that.

## Additional features MSF doesn't have:
- In the list of sessions, if any session has disconnected, it has a `(!)`. You won't have to join each session to find out.
- In the list of sessions, if any session has buffered bytes waiting to be displayed, it is shown. ie. `320B`
- If you try to send `Ctrl-C`, you get a friendly message reminding that it's not possible to transmit (e.g., for Windows) rather than accidentally killing your reverse shell. `Ctrl-Z` will background ncmdr, which is sometimes useful.
- If you press `Up-Arrow` you have a history of input you can reuse, provided by the client-side.

## Use

```bash
# launch listening handler
$ node ncmdr.mjs 443 127.0.0.1
[*] listening on tcp://127.0.0.1:443 ...
```

## Test

```bash
# in new terminal
$ nc -vn 127.0.0.1 443
hello1
```

In ncmdr, new session is received and backgrounded:
```
[*] new session   0 127.0.0.1:443 <- 127.0.0.1:39872 at 2021-11-18T18:50:55.460Z
```

You can list active sessions:
```
sessions
  session   0 127.0.0.1:443 <- 127.0.0.1:39872 at 2021-11-18T18:50:55.460Z 3B 
1 session(s) total.
```

You can join a specific session, and any buffered contents are displayed first.
```
session -i 0
selected session 0
hello1
```

You can write to the session simply by continuing to type, and then hitting `<ENTER>` key to transmit. Anything you transmit should appear in the `netcat` terminal.

You can `background` the session again:
```
background
backgrounded session 0.
```

In case you forget any of these commands, you can get more `help` from the interactive shell:
```
help

  sessions            list available sessions 
  session -i <ID>     select a session by id
  session -k <ID>     terminate a session by id
  background          send the current session to the background
  help                see this message
  exit                end process

```

## Known Issues

1) There is an echo/repeat that in some cases appears 2-3 times for each line you transmit. That's because I wanted to error on the side of always seeing my input and any remote output. Otherwise there are scenarios where you are typing and not sure if it is being received as input by the client or being received and acknowledged by the server. So it's not really a bug but it is annoying at first.
2) There is a bug where connections that don't send FIN are not detected as having dropped off. They will appear as though they are still connected. TCP protocol inherently supports this case with a heartbeat and timeout event, but for some reason mine isn't always triggered. Will fix eventually but it wasn't necessary for now.

## Future Ideas

It might be useful to add interactive shell commands that do things like dump the buffer to a file. But for now I've solved this with a [Terminator](https://github.com/gnome-terminator/terminator) plugin ([Dump to File](https://github.com/kmoppel/dumptofile/tree/terminator-1.90)). However it might still be useful if receiving bin dumps (ie. exfil).