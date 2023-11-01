import { IndexerConfig, Transport, TransportMock } from './';

export class TestIndexer {
    protected readonly config: IndexerConfig;
    protected readonly transport: Transport;

    constructor(config: IndexerConfig) {
        this.config = config;
        this.transport = new TransportMock(this.config);
    }

    run(subscribers: any) {
        this.transport.run(subscribers);
    }

    stop() {}
}
