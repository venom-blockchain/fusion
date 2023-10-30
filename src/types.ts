export enum TransportType {
    stdio = 'Stdio',
    http2 = 'Http2'
}

export interface IndexerConfig {
    transport: TransportType,
    url?: string;
    installPath?: string;
    dbPath?: string;
    abiPath?: string;
    filters?: MessageFilter[]
}

export interface MessageParam {
    name: string;
    value: string;
}

export interface Message {
    message: string;
    message_hash: string;
    message_type: MessageType;
    block_id: string;
    transaction_id: string;
    transaction_timestamp: number;
    index_in_transaction: number;
    contract_name: string;
    filter_name: string;
    params: MessageParam[];
}

export interface MessageFilter {
    type: FilterType | ContractType;
    entries: MessageEntry[];
}

export interface ContractType {
    contract: {
        name: string;
        abi_path: string;
    }
}

export interface MessageEntry {
    name: string;
    sender?: string | AddressOrCodeHash;
    receiver?: string | AddressOrCodeHash;
    message?: ContractMessage;
}

export interface ContractMessage {
    name: string;
    type: MessageType;
}

export enum MessageType {
    InternalInbound = 'internal_inbound',
    InternalOutbound = 'internal_outbound',
    ExternalInbound = 'external_inbound',
    ExternalOutbound = 'external_outbound',
}

export enum FilterType {
    AnyMessage = 'any_message',
    NativeTransfer = 'native_transfer',
}

export interface AddressOrCodeHash {
    address?: string;
    code_hash?: string;
}
