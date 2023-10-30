import * as fs from 'fs';
import * as path from 'path';
import { stringify } from 'yaml';
import { spawn } from 'child_process';
import { Installer } from './installer';
import { Transport } from './transport';
import { TransportStdio } from './transport-stdio';
import { TransportHttp2 } from './transport-http2';
import {
    IndexerConfig,
    TransportType,
    MessageFilter,
    ContractType,
    AddressOrCodeHash
} from './types';
import { MessageDecoder } from './message-decoder';

export class Indexer {

    protected readonly config: IndexerConfig;
    protected readonly skipStart: boolean;
    protected readonly transport: Transport;
    protected readonly transportType;

    constructor(config:
        { transport: TransportType.http2, url: string}
        |   {
                transport: TransportType,
                installPath: string;
                dbPath: string;
                abiPath: string;
                filters: MessageFilter[]
            }
    ) {
        this.config = config;

        this.skipStart = false;
        if (config.transport == TransportType.stdio) {
            this.transport = new TransportStdio();
        } else if (config.transport == TransportType.http2) {
            const messageDecoder = new MessageDecoder(this.config.filters, this.config.abiPath);
            this.transport = new TransportHttp2(this.config.url ?? this.http2Url(), messageDecoder);
            if (this.config.url) {
                this.skipStart = true;
            }
        }
    }

    run(subscribers: any) {
        if (!this.skipStart) {
            const { fullPath, execFullPath } = Installer.EnsureInstall(this.config.installPath);

            this.GenerateIndexerConfig(fullPath);

            // run indexer
            const dataFolder = this.getDataFolder(fullPath);
            const { dir, base } = path.parse(execFullPath);
            const child = spawn(
                './' + base,
                [
                    '--config', `${dataFolder}/config.yaml`,
                    '--global-config', `${dataFolder}/ton-global.config.json`
                ],
                {
                    cwd: dir
                }
            );

            if (!this.transport.onProcessStarted(child)) {
                child.stdout.on('data', (data) => {
                    process.stdout.write(data);
                });
            }

            child.on('exit', function (code, signal) {
                throw Error('unexpected indexer termination');
            });

            child.stderr.on('data', (data) => {
                console.error(data.toString('utf8'));
            });
        }

        this.transport.run(subscribers);
    }

    stop() {
        // TODO: stop indexer
    }

    GenerateIndexerConfig(fullPath: string) {
        const message_filters : MessageFilter[] = Object.assign(this.config.filters);

        // check abi path
        for(let filter of message_filters) {

            const contract = (filter.type as ContractType).contract;
            if (contract) {
                contract.abi_path = path.resolve(this.config.abiPath, contract.abi_path);
                if (!fs.existsSync(contract.abi_path)) {
                    throw Error(`ABI ${contract.abi_path} does not exists`);
                }
            }

            for (let entry of filter.entries) {
                // fix address or hash
                if (this.isText(entry.sender)) {
                    entry.sender = this.makeAddressOrHash(entry.sender);
                }

                if (this.isText(entry.receiver)) {
                    entry.receiver = this.makeAddressOrHash(entry.receiver);
                }
            }
        }

        const dataFolder = this.getDataFolder(fullPath);
        const indexerConfig = stringify({
            rpc_config: {
                listen_address: "0.0.0.0:8081",
                type: 'simple',
            },
            metrics_settings: {
                listen_address: "0.0.0.0:10000",
                collection_interval_sec: 10,
            },
            scan_type: {
                kind: 'FromNetwork',
                node_config: {
                    db_path: this.config.dbPath,
                    adnl_port: 30100,
                    temp_keys_path: dataFolder + '/adnl-keys.json',
                    parallel_archive_downloads: 32,
                    db_options: {
                        rocksdb_lru_capacity: String("512 MB"),
                        cells_cache_size: String("4 GB"),
                    }
                }
            },
            serializer: {
                kind: this.config.transport == TransportType.http2 ? 'Protobuf' : 'Json',
            },
            transport: {
              kind: this.config.transport,
              ...((this.config.transport == TransportType.http2) && { capacity: 1024, listen_address: this.http2RawURL() }),
            },
            filter_config: {
                message_filters
            }
        });

        fs.writeFileSync(dataFolder + '/config.yaml', indexerConfig);
    }

    protected getDataFolder(fullPath: string) {
        return fullPath + '/data';
    }

    protected makeAddressOrHash(value: string) : AddressOrCodeHash {
        if (this.validateAddress(value)) {
            return { address: value };
        } else if (this.isHex(value)) {
            return { code_hash: value}
        } else {
            throw Error('parameter is not contract Address or code hash')
        }
    }

    protected validateAddress(walletAddress: string) {
        const addressArray = walletAddress.split(':');
        if (addressArray.length != 2)
            return false;

        return this.isHex(addressArray[0]) && this.isHex(addressArray[1]);
    }

    protected isHex(value: string) {
        return value.match(/^[0-9a-fA-F]+$/);
    }

    protected isText(data: unknown) : data is string {
        return typeof data === 'string';
    };

    protected http2Url() : string {
        return 'http://' + this.http2RawURL();
    }

    protected http2RawURL() : string {
        return '127.0.0.1:3000';
    }
}
