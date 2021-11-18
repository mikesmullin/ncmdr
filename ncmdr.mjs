#!/usr/bin/env node
import net from 'net';
import readline from 'readline';

class NCmdr {
    #bindaddr='0.0.0.0';
    #port=0;
    #rl;

    help() {
        console.log(
`usage:
  ncmdr <port> [bindaddr]`
        );
        process.exit(0);
    }

    async main() {
        const [,,port,bindaddr] = process.argv;
        if (null != port) { this.#port = parseInt(port,10); if (isNaN(this.#port)) { this.#port = 0; }}
        if (null != bindaddr) { this.#bindaddr = bindaddr; }
        if (0 === this.#port) { this.help(); process.exit(0); }

        this.#rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: true,
            prompt: '',
        });
        process.on('SIGINT', this.onsigint.bind(this));
        this.#rl.on('line', this.oninput.bind(this));
        this.#rl.on('SIGINT', this.onsigint.bind(this));
        const server = net.createServer(this.accept.bind(this));
        server.on('error', this.onerror.bind(this));
        server.listen(this.#port, this.#bindaddr, ()=>this.listening(server));
    }

    onsigint() {
        const session = this.#sessions[this.#currentSessionId];
        if (session?.isOpen) {
            // TODO: forward
            console.log(`not currently possible to forward Ctrl+c. sorry.`);
        }
        else {
            this.exit(false);
        }
    }

    exit(force) {
        let activeSessions = 0;
        for (let i=0; i<this.#sessions.length; i++) {
            if (true == this.#sessions[i].isOpen) {
                activeSessions++;
            }
        }
        if (activeSessions > 0 && !force) {
            console.log(`You have ${activeSessions} active session(s). Type \`exit -y\` to force.`);
        }
        else {
            console.log('bye');
            process.exit(0);
        }        
    }

    listening(server) {
        const addr = server.address();
        console.log(`[*] listening on tcp://${addr.address}:${addr.port} ...`);
    }

    accept(socket) {
        const id = this.#sessions.length;
        const session = new Session(id, socket);
        this.#sessions.push(session);
        console.log(`[*] new ${session.human}`);

        const push = (s) => {
            if (id === this.#currentSessionId) {
                console.log(s);
            }
            else {
                session.buffer.push(Buffer.from(s));
            }
        };

        socket.on('data', (buf) => {
            if (id === this.#currentSessionId) {
                console.log(buf.toString('utf-8'));
            }
            else {
                session.buffer.push(buf);
            }
        });
        socket.on('error', (err) => {
            push(`Socket ${id} error: ${err}`);
        });
        socket.on('timeout', () => {
            push(`[*] session ${id} socket timeout.\n`);
            this.hangup(id);
        });
        socket.on('end', () => {
            push(`[*] session ${id} remote client signaled socket end.\n`);
            // this.hangup(id);
        });
        socket.on('close', () => {
            push(`[*] session ${id} socket closed.\n`);
            this.hangup(id);
        });
    }

    hangup(id) {
        const session = this.#sessions[id];
        if (null != session) {
            session.isOpen = false;
            try {
                session.socket.end();
            }
            catch(e) {}
        }
        if (id === this.#currentSessionId) {
            console.log('please select a new session.');
            this.#currentSessionId = null;
        }
    }

    onerror(err) {
        this.hangup(this.#currentSessionId);
        console.error('Server Error: ', err);
    }

    #sessions = [];
    #currentSessionId = null;

    static #RX_SESSION_SELECT = /sessions?(?: -i)? (\d+)/;
    static #RX_SESSION_KILL = /sessions? -k (\d+)/;
    static #RX_SESSION_EXIT = /exit ?(-y)?/;

    oninput(line) {
        let m;
        if (null == this.#currentSessionId && 'help' === line) {
            console.log(`
  sessions            list available sessions 
  session -i <ID>     select a session by id
  session -k <ID>     terminate a session by id
  background          send the current session to the background
  help                see this message
  exit                end process
`
            );
        }
        else if (null == this.#currentSessionId && 'sessions' === line) {
            let ii = 0;
            for (let i=0; i<this.#sessions.length; i++) {
                if (true == this.#sessions[i].isDeleted) { continue; }
                ii++;
                console.log(`  ${this.#sessions[i].toString()}`);
            }
            console.log(`${ii} session(s) total.`);
        }
        else if (null == this.#currentSessionId && null != (m = line.match(NCmdr.#RX_SESSION_SELECT))) {
            const id = parseInt(m[1], 10);
            const session = this.#sessions[id];
            if (true === session?.isOpen) {
                this.#currentSessionId = id;
                console.log(`selected session ${id}`);
                if (session.buffer.length > 0) {
                    console.log(Buffer.concat(session.buffer).toString('utf-8'));
                    session.buffer.length = 0;
                }
            }
            else {
                if (session?.buffer.length > 0) {
                    console.log(Buffer.concat(session.buffer).toString('utf-8'));
                    session.buffer.length = 0;
                    session.isDeleted = true;
                }
                else {
                    console.error('invalid session id!');
                }
            }
        }
        else if (null != this.#currentSessionId && 'background' === line) {
            if (null != this.#currentSessionId) {
                console.log(`backgrounded session ${this.#currentSessionId}.`);
                this.#currentSessionId = null;
            }
        }
        else if (null == this.#currentSessionId && null != (m = line.match(NCmdr.#RX_SESSION_KILL))) {
            const id = parseInt(m[1], 10);
            const session = this.#sessions[id];
            if (null != session) {
                console.log(`terminating session ${id}.`);
                this.hangup(id);
                session.isDeleted = true;
            }
        }
        else if (null == this.#currentSessionId && null != (m = line.match(NCmdr.#RX_SESSION_EXIT))) {
            const force = '-y' === m[1];
            this.exit(force);
        }
        else { 
            // forward
            const session = this.#sessions[this.#currentSessionId];
            if (true !== session?.isOpen) {
                console.log('please select a session.');
            }
            else {
                session.socket.write(line+"\n");
            }
        }
    }
}

class Session {
    id;
    socket;
    human;
    isOpen = true;
    isDeleted = false;
    buffer = [];
    constructor(id,socket) {
        this.id = id;
        this.socket = socket;
        this.human = `session ${`   ${this.id}`.substr(-3)} ${socket.localAddress}:${socket.localPort} <- ${socket.remoteAddress}:${socket.remotePort} at ${new Date().toISOString()}`;
    }
    toString() {
        return `${this.human} ${this.buffer.length < 1 ? 0 : Buffer.concat(this.buffer).length}B ${this.isOpen ? '': '(!)'}`;
    }
}

try {
    new NCmdr().main();
}
catch(e) {
    console.error(e);
    process.exit(1);
}