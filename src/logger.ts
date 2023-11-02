import * as winston from 'winston';

export class Logger extends winston.Logger {
    static createLogger(options?: winston.LoggerOptions) {
        return winston.createLogger({
            transports: [
                new winston.transports.Console({
                    format: winston.format.combine(
                        winston.format.timestamp(),
                        winston.format.align(),
                        winston.format.printf(
                            (info) => `${info.timestamp}  [${info.level}]  ${info.module || 'main'}  ${info.message}`
                        )
                    )
                })
            ], ...options
        })
    }
}
