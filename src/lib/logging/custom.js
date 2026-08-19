/**
 * FHIR Transformation
 * custom logging
 *
 * @license MIT
 */

import morgan from 'morgan';

morgan.token('header_uuid', function (req) {
    return req.headers['x-request-id'];
});

morgan.token('request-body', function (req) {
    return JSON.stringify(req.body);
});

morgan.token('time', function () {
    var date = new Date();

    var tzo = -date.getTimezoneOffset(),
        dif = tzo >= 0 ? '+' : '-',
        pad = function (num) {
            var norm = Math.floor(Math.abs(num));
            return (norm < 10 ? '0' : '') + norm;
        };
    return date.getFullYear() +
        '-' + pad(date.getMonth() + 1) +
        '-' + pad(date.getDate()) +
        'T' + pad(date.getHours()) +
        ':' + pad(date.getMinutes()) +
        ':' + pad(date.getSeconds()) +
        dif + pad(tzo / 60) +
        ':' + pad(tzo % 60);
});

morgan.token('latency', function (req, res) {
    if (!req._startAt || !res._startAt) {
        // missing request and/or response start time
        return;
    }
    var ms = (res._startAt[0] - req._startAt[0]) * 1e3 +
        (res._startAt[1] - req._startAt[1]) * 1e-6;

    return ms;

});

morgan.token('latency_human', function (req, res) {
    if (!req._startAt || !res._startAt) {
        // missing request and/or response start time
        return;
    }
    var ms = (res._startAt[0] - req._startAt[0]) * 1e3 +
        (res._startAt[1] - req._startAt[1]) * 1e-6;

    return ms / 1000;

});

morgan.token('bytes_out', function (req, res, field) {
    var result = (res.getHeaders() || {})[field.toLowerCase()];
    if (result && field.toLowerCase() === 'content-length') {
        var len = parseInt(result, 10);
        return len;
    } else
        return result;
});

morgan.token('bytes_in', function (req, res, field) {
    var result = (req.headers || {})[field.toLowerCase()];
    if (result && field.toLowerCase() === 'content-length') {
        var len = parseInt(result, 10);
        return len;
    } else
        return result;
});

morgan.token('user_agent', function (req) {
    var result = req.headers['user-agent'];
    if (result != "") {
        return result;
    } else
        return result;
});

morgan.token('host', function (req) {
    var result = req.headers['host'];
    if (result != "") {
        return result;
    } else
        return result;
});

morgan.token('caller_method', function () {
    const oldStackTrace = Error.prepareStackTrace;
    try {
        // eslint-disable-next-line handle-callback-err
        Error.prepareStackTrace = (err, structuredStackTrace) => structuredStackTrace;
        Error.captureStackTrace(this);
        const callSite = this.stack.find(line => line.getFileName().indexOf('/logger/') < 0 && line.getFileName().indexOf('/node_modules/') < 0);
        return callSite.getFileName() + ':' + callSite.getLineNumber();
    } finally {
        Error.prepareStackTrace = oldStackTrace;
    }
});

morgan.token('stack_trace', function () {
    return new Error('test').stack;
});

export default function () {
    return morgan(function (tokens, req, res) {
        return JSON.stringify({
            'time': tokens['time'],
            'method': tokens.method(req, res),
            'uri': tokens.url(req, res),
            'caller': tokens['caller_method'](),
            'bytes_out': tokens['bytes_out'](req, res, 'content-length'),
            'bytes_in': tokens['bytes_in'](req, res, 'content-length'),
            'user_agent': tokens['user_agent'](req),
            'host': tokens['host'](req),
            'status': parseInt(tokens.status(req, res)),
            'request_id': tokens.header_uuid(req, res),
            'latency_human': tokens['latency_human'](req, res) + ' ms',
            'latency': tokens['latency'](req, res),
            'message': tokens['request-body'](req, res),
            'remote_ip': tokens['remote-addr'](req, res),
            'stack_trace': tokens['stack_trace'](req, res),
        });
    }, {
        skip: function () {
            return process.env['NODE_ENV'] == "testing";
        }
    });
}
