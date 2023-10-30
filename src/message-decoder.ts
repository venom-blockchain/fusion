import { decodeInput, decodeOutput, unpackFromCell } from 'nekoton-wasm';
import * as path from 'path';
import * as fs from 'fs';

import { Message, MessageType, MessageFilter, ContractType } from './types';


export class MessageDecoder {

    protected readonly abiPath: string;
    protected readonly filters: MessageFilter[];

    constructor(filters: MessageFilter[], abiPath: string) {
        this.abiPath = abiPath;
        this.filters = filters;
    }

    decode(message: any) : Message {
        if (!this.filters) {
            return;
        }

        message.id = this.decodeId(message.id);
        message.blockId = this.decodeId(message.blockId);
        message.transactionId = this.decodeId(message.transactionId);
        message.bodyBoc = message.bodyBoc.toString('base64');

        message.messageType = ([
            'UNSPECIFIED',
            'internal_inbound',
            'internal_outbound',
            'external_inbound',
            'external_outbound',
        ])[message.messageType];

        const messageType = message.messageType;
        const body = message.bodyBoc.toString('base64');

        if (message.internalHeader) {
            message.internalHeader.dst = this.decodeAddress(message.internalHeader.dst);
            message.internalHeader.src = this.decodeAddress(message.internalHeader.src);
            message.internalHeader.value = this.decodeUInt128(message.internalHeader.value);
            message.internalHeader.ihrFee = this.decodeUInt128(message.internalHeader.ihrFee);
            message.internalHeader.fwdFee = this.decodeUInt128(message.internalHeader.fwdFee);
        }

        if (message.extInboundHeader) {
            message.extInboundHeader.dst = this.decodeAddress(message.extInboundHeader.dst);
        }

        if (message.extOutboundHeader) {
            message.extOutboundHeader.src = this.decodeAddress(message.extOutboundHeader.src);
        }

        const result = message;
        for(let filter of this.filters) {
            const contract = (filter.type as ContractType).contract;
            if (contract && contract.name == message.contractName) {
                const entry = filter.entries.find(item => item.name == message.filterName);
                if (entry) {
                    const methodEventName = entry.message.name;

                    const abi = fs.readFileSync(path.resolve(this.abiPath, contract.abi_path)).toString();

                    try {
                        if (messageType == MessageType.ExternalInbound || messageType == MessageType.InternalInbound) {
                            result.params = decodeInput(body, abi, methodEventName, messageType == MessageType.InternalInbound).input;
                        } else {
                            result.params = decodeOutput(body, abi, methodEventName).output;
                        }
                    } catch (err) {
                        console.error(`decode param error.\n\tBody: ${body}\n\tMethod: ${methodEventName}\n\tError: ${err}`)
                    }

                    break;
                }
            }
        }

        return result;
    }

    decodeAddress(buffer: Buffer) : string {
        if (!buffer) {
            return undefined;
        }

        const base64Address = buffer.toString('base64');
        const abiParams = [{name: 'address', type: 'address'}];
        try {
            return unpackFromCell(abiParams, base64Address, false).address.toString();
        } catch (err) {
            console.error(`can't unpack address: ${base64Address}`);
            return '';
        }
    }

    decodeUInt128(buffer: Buffer) : string {
        if (!buffer) {
            return undefined;
        }

        const base64Address = buffer.toString('base64');
        const abiParams = [{name: 'value', type: 'uint128'}];
        try {
            return unpackFromCell(abiParams, base64Address, false).value.toString();
        } catch (err) {
            console.error(`can't unpack uint128: ${base64Address}`);
            return '';
        }
    }

    decodeId(buffer: Buffer) : string {
        if (!buffer) {
            return undefined;
        }

        return buffer.toString('hex');
    }
}
