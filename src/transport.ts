import { ChildProcessWithoutNullStreams } from 'child_process';

export interface Transport {
    onProcessStarted(process: ChildProcessWithoutNullStreams) : boolean;
    run(subscribers: any);
}