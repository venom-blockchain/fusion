import { ChildProcessWithoutNullStreams } from 'child_process';
import { Transport } from './transport';

export class TransportStdio implements Transport {

    protected process: ChildProcessWithoutNullStreams;

    onProcessStarted(process: ChildProcessWithoutNullStreams) : boolean {
        this.process = process;
        return true;
    }

    run(subscribers: any) {
        let message = '';
        let messagePos = 0;
        let messageLen = 0;
        let messageLenBuff = [];
        let messageLenPos = 0;
        const MESSAGE_LEN_BYTES_COUNT = 4;

        const START_PATERN = '-----\n';
        let startPaternPos = 0;

        const END_PATERN = '\n-----\n';
        let endPaternPos = 0;

        const clearAllPos = () => {
            startPaternPos = 0;
            endPaternPos = 0;
            messageLen = 0;
            messageLenPos = 0;
            messagePos = 0;
            messageLenBuff = [];
            message = '';
        }

        this.process.stdout.on('data', (data) => {
            let dataPos = 0;
            while(dataPos < data.length) {
                if (startPaternPos < START_PATERN.length) {
                    if (START_PATERN[startPaternPos] == String.fromCharCode(data[dataPos])) {
                        startPaternPos++;
                    } else {
                        if (startPaternPos > 0) {
                            console.log(START_PATERN.slice(0, startPaternPos - 1));
                        }
                        process.stdout.write(String.fromCharCode(data[dataPos]));
                        startPaternPos = 0;
                    }
                } else if (messageLenPos < MESSAGE_LEN_BYTES_COUNT) {
                    messageLenBuff.push(data[dataPos]);
                    messageLenPos++;
                    if (messageLenPos == MESSAGE_LEN_BYTES_COUNT) {
                        for(let i = 0; i < MESSAGE_LEN_BYTES_COUNT; i++) {
                            messageLen = (messageLen << 8) + messageLenBuff[i];
                        }
                    }
                } else if (messagePos < messageLen) {
                    message += String.fromCharCode(data[dataPos]);
                    messagePos++;
                } else if (endPaternPos < END_PATERN.length){
                    if (END_PATERN[endPaternPos] == String.fromCharCode(data[dataPos])) {
                        endPaternPos++;
                        if (endPaternPos == END_PATERN.length) {
                            const messageObject = JSON.parse(message);
                            if (subscribers[messageObject.filter_name]) {
                                subscribers[messageObject.filter_name](messageObject);
                            }

                            clearAllPos();
                        }
                    } else {
                        console.error('Invalid Message Format');
                        console.error(START_PATERN);
                        console.error(message);
                        console.error(END_PATERN.slice(0, startPaternPos - 1));
                        clearAllPos();
                    }
                }

                dataPos++;
            }
        });
    }
}