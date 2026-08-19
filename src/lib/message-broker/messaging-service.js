import container from 'rhea';
import WorkerPool from "../../lib/workers/workerPool.js";
import os from "os";
import logging from "../../lib/logging/logging.js";

let logger = logging();

export default function (nconf) {
    const workerPool = new WorkerPool(
        "./src/lib/workers/worker.js",
        os.cpus().length
    );

    let sender;
    let maxRetries = Number.isInteger(nconf.get('max_retries')) ? nconf.get('max_retries') : 1;

    const msgBrokerConfig = {
        host: nconf.get("message_broker_host"),
        port: nconf.get('message_broker_port'),
        username: nconf.get('message_broker_username'),
        password: nconf.get('message_broker_password')
    };

    const connection = container.connect(msgBrokerConfig);

    connection.open_receiver(nconf.get('input_queue_name'));
    sender = connection.open_sender({
        target: {
            address: nconf.get('output_queue_name'),
            capabilities:['queue']
        },
    });

    /*
    *   Message events
    */
    connection.on('accepted', function (context) {
        logger.info(`Message being sent to broker with connection-id : ${JSON.parse(container.message.decode(context.delivery.data[0]).body)["connection-id"]}`);
    });

    connection.on('settled', function (context) {
        logger.info(`Message received by broker with connection-id : ${JSON.parse(container.message.decode(context.delivery.data[0]).body)["connection-id"]}`);
    });

    connection.on('message', function (context) {
        try {
            let message = JSON.parse(context.message.body.content);
            logger.info(`Message received. [${JSON.stringify(message)}]`);
            transformMessage(message, workerPool, sender, 0, maxRetries);
        } catch (err) {
            logger.error(`Error while processing message : [${JSON.stringify(context.message.body)}]`);
            logger.error(err);
        }

    });

    /*
    *   Broker events
    */
    connection.on('disconnected', function (context) {
        if (context.error && context.error.stack) logger.error(context.error.stack);
    });

    connection.on('error', function (context) {
        if (context.stack) logger.error(context.stack);
    });

    connection.on('connection_open', function (context) {
        logger.info(`Established connection with the message broker at : ${context.connection.options.host}`);
    });

}

function sendMessageToBroker(convertedMessage, originalMessage, sender) {
    const message = {};
    message.body = convertedMessage;
    message.version = originalMessage.version;
    message.timezone = originalMessage.timezone;
    message["connection-id"] = originalMessage["connection-id"];
    sender.send({body: JSON.stringify(message)});
}

function transformMessage(message, workerPool, connection, retries, maxRetries) {
    workerPool
        .exec({
            type: "/api/convert/:srcDataType/:template",
            srcData: message.body,
            srcDataType: message.type,
            templateName: message.template,
            timezone: message.timezone,
        })
        .then((result) => {
            if (result.status == 200) {
                const resultMessage = result.resultMsg;
                sendMessageToBroker(resultMessage.fhirResource, message, connection);
            }
            else {
                if (retries >= maxRetries) {
                    logger.error(`Message conversion of message with connection id: [${message["connection-id"]}] failed due to following error : [${JSON.stringify(result.resultMsg.error)}]`);
                    return;
                }
                logger.error(`Message conversion of message with connection id: [${message["connection-id"]}] failed due to following error : [${JSON.stringify(result.resultMsg.error)}], Trying again.`);
                transformMessage(message, workerPool, connection, ++retries, maxRetries);
            }

        });
}

