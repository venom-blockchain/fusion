import { loadSync, Type, Reader } from "protobufjs";
import * as http2 from 'http2'
import * as path from 'path';

import { Transport } from './transport';
import { ChildProcessWithoutNullStreams } from 'child_process';
import { MessageDecoder } from './message-decoder';
import { Logger } from './logger';

export class TransportHttp2 implements Transport {

    protected logger: Logger;

    protected url: string;
    protected subscribers: any;

    protected readonly message: Type;
    protected readonly messageDecoder: MessageDecoder;

    protected startTime: number;
    protected static readonly START_TIMEOUT = 120 * 1000; // ms

    constructor(url: string, decoder: MessageDecoder) {
        this.url = url;
        this.messageDecoder = decoder;

        const root = loadSync(path.resolve(__dirname, '../', 'data_producer.proto'));

        this.message = root.lookupType("Message");

        this.logger = Logger.createLogger({ level: process.env.LOG_LEVEL });
    }

    onProcessStarted(process: ChildProcessWithoutNullStreams) : boolean {
        return false;
    }

    run(subscribers: any) {
        this.startTime = Date.now();
        this.subscribers = subscribers;
        this.connect();
    }

    protected connect() {
        const client = http2.connect(this.url);
        client.on('error', (err) => this.onClientError(err));

        let request = client.request({ ':path': '/messages/data' });
        request.on('error', (err) => this.onStreamError(err));

        request.setEncoding('binary');

        let buffer: Buffer;
        request.on('data', (data) => {

            const dataBuffer = Buffer.from(data, 'binary');

            let actualData;
            if (buffer) {
                actualData = Buffer.concat([buffer, dataBuffer]);
            } else {
                actualData = dataBuffer;
                        }

            const SMALEST_MESSAGE = 8;
            const reader = new Reader(actualData);

            let nextPos = 0;
            while ((actualData.length - reader.pos) > SMALEST_MESSAGE) {
                const length = reader.uint64();
                if (length.high > 0) {
                    this.logger.log({
                        level: 'info',
                        message: `http2 stream error: wrong length`,
                    });
                    throw Error('message length too large')
                } else if (length.low > (actualData.length - reader.pos)) {
                    break;
                    }

                const message : any = this.message.decode(reader, length.low);
                nextPos = reader.pos;

                if (this.subscribers[message.filterName]) {
                    const messageObject = this.message.toObject(message, { defaults: true, longs: String });
                    this.subscribers[message.filterName](this.messageDecoder.decode(messageObject));
                }
            }

            if (actualData.length > nextPos) {
                buffer = actualData.slice(nextPos);
            } else {
                buffer = null;
            }
        });
    }

    protected onStreamError(err: any) {
        if ((Date.now() - this.startTime) > TransportHttp2.START_TIMEOUT ) {
            this.logger.log({
                level: 'info',
                message: `http2 stream error: ${err}, reconnecting...`,
            });
        }
        this.connect();
    }

    protected onClientError(err: any) {
        if ((Date.now() - this.startTime) > TransportHttp2.START_TIMEOUT ) {
            this.logger.log({
                level: 'info',
                message: `http2 connection error: ${err}`,
            });
        }
    }
}