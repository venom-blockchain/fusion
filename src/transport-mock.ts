import { decodeInput, decodeEvent, MethodName } from 'nekoton-wasm';
import * as fs from 'fs';
import * as path from 'path';

import * as Codec from '@venom-blockchain/fusion-codec'

import { Transport } from './transport';
import { Block, ContractType, IndexerConfig, MessageEntry } from './types';

type Contracts = {
    [key: string]: {
        abi: {};
        entries: MessageEntry[]
    }
}

export class TransportMock implements Transport {
    public config: IndexerConfig;
    public abis: Codec.AbiEntity[] = [];

    constructor(config: IndexerConfig) {
        this.config = config;
    }

    onProcessStarted() : boolean {
        return true;
    }

    run(subscribers: any) {
        const files = fs.readdirSync(path.resolve(this.config.abiPath));
        const contracts: Contracts = {};
        const msgsBySender: {[key: string]: MessageEntry} = {};
        const msgsByReceiver: {[key: string]: MessageEntry} = {};

        files.forEach(async file => {
            if (path.extname(file) === '.json') {
                const filePath = path.join(path.resolve(this.config.abiPath), file);
                this.abis[file] = require(filePath);
            }
        });

        this.config.filters.map((filter) => {
            if (typeof filter.type === 'object' && 'contract' in filter.type) {
                const { contract } = filter.type as ContractType;

                contracts[contract.name] = {
                    abi: this.abis[contract.abi_path],
                    entries: filter.entries,
                };
            } else if (filter.type === "any_message") {
                filter.entries.forEach((entry) => {
                    if (entry.sender) {
                        if (typeof entry.sender === 'string') {
                            msgsBySender[entry.sender] = entry;
                        } else if (typeof entry.sender === 'object') {
                            msgsBySender[entry.sender.address] = entry;
                        }
                    } else if (entry.receiver) {
                        if (typeof entry.receiver === 'string') {
                            msgsByReceiver[entry.receiver] = entry;
                        } else if (typeof entry.receiver === 'object') {
                            msgsByReceiver[entry.receiver.address] = entry;
                        }
                    }
                })
            } else {
                throw new Error(`Invalid filter type: ${filter.type}`);
            }
        })

        const { data: { blocks } } = JSON.parse(fs.readFileSync(path.resolve(this.config.dbPath), 'utf8'));

        blocks.forEach((b: Block) => {
            const { transactions } = JSON.parse(Codec.deserialize(b.boc, 'block'))

            Object.keys(transactions).forEach((txHash) => {
                const tx = transactions[txHash]

                const decodedMsg = decodeMsg(contracts, tx.in_msg, 'message')
                decodedMsg.flat().filter((item) => !!item).forEach((item) => subscribers[item.name](tx.in_msg, item.call))

                if (msgsBySender[tx.in_msg.src]) {
                    subscribers[msgsBySender[tx.in_msg.src].name](tx.in_msg)
                }

                if (msgsByReceiver[tx.in_msg.dst]) {
                    subscribers[msgsByReceiver[tx.in_msg.dst].name](tx.in_msg)
                }

                transactions[txHash].out_msgs.map((msg) => {
                    if (msg.msg_type_name === 'extOut') {
                        const decodedMsg = decodeMsg(contracts, msg, 'event')
                        decodedMsg.flat().filter((item) => !!item).forEach((item) => subscribers[item.name](msg, item.event))
                    }
                })
            });
        });
    }
}

function decodeMsg(contracts, msg, entryType) {
    return Object.keys(contracts).map((handlerName) => {
        const { abi, entries } = contracts[handlerName];
        return entries.map((entry: { name: string, message: { name: MethodName; }; }) => {
            if (entryType === 'message') {
                try {
                    const call = decodeInput(msg.body, JSON.stringify(abi), entry.message.name, msg.msg_type_name == 'internal')
                    if (!call) return undefined
                    return {
                        name: entry.name,
                        call
                    }
                } catch (err) {}
            } else if (entryType === 'event') {
                try {
                    const event = decodeEvent(msg.body, JSON.stringify(abi), entry.message.name)
                    if (!event) return undefined
                    return {
                        name: entry.name,
                        event
                    }
                } catch (err) {}
            }
        })
    })
}