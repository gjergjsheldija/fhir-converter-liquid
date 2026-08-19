import {equal, ok} from 'assert';
import {createServer as _createServer} from 'http';
import morgan from "morgan";
import request from 'supertest';
import split from 'split';

describe('custom logging', function () {
    describe(':header_uuid', function () {
        it('should be the same set in the header', function (done) {
            var cb = after(2, function (err, res, line) {
                if (err) return done(err);
                equal(line, '123456798');
                done();
            });

            var stream = createLineStream(function (line) {
                cb(null, null, line);
            });

            request(createServer(':header_uuid', {stream: stream}))
                .get('/')
                .set('x-request-id', '123456798')
                .expect(200, cb);
        });
    });

    describe(':user_agent', function () {
        it('should be the same set in the header', function (done) {
            var cb = after(2, function (err, res, line) {
                if (err) return done(err);
                equal(line, 'SomeUserAgent 123/1');
                done();
            });

            var stream = createLineStream(function (line) {
                cb(null, null, line);
            });

            request(createServer(':user_agent', {stream: stream}))
                .get('/')
                .set('user-agent', 'SomeUserAgent 123/1')
                .expect(200, cb);
        });
    });

    describe(':host', function () {
        it('should be the same set in the header', function (done) {
            var cb = after(2, function (err, res, line) {
                if (err) return done(err);
                equal(line, 'sample.localhost');
                done();
            });

            var stream = createLineStream(function (line) {
                cb(null, null, line);
            });

            request(createServer(':host', {stream: stream}))
                .get('/')
                .set('host', 'sample.localhost')
                .expect(200, cb);
        });
    });

    describe(':time', function () {
        it('should get current date in "ISO8601" format', function (done) {
            var cb = after(2, function (err, res, line) {
                if (err) return done(err);
                ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}/.test(line));
                done();
            });

            var stream = createLineStream(function (line) {
                cb(null, null, line);
            });

            request(createServer(':time', {stream: stream}))
                .get('/')
                .expect(200, cb);
        });

    });

    describe(':latency', function () {
        it('should return the latency', function (done) {
            var cb = after(2, function (err, res, line) {
                if (err) return done(err);
                ok(Number.parseFloat(line).toFixed(2) < 2);
                done();
            });

            var stream = createLineStream(function (line) {
                cb(null, null, line);
            });

            request(createServer(':latency', {stream: stream}))
                .get('/')
                .expect(200, cb);
        });

    });

    describe(':latency_human', function () {
        it('should return the latency in human format', function (done) {
            var cb = after(2, function (err, res, line) {
                if (err) return done(err);
                ok(((Number.parseFloat(line).toFixed(2) * 1000) < 2.0));
                done();
            });

            var stream = createLineStream(function (line) {
                cb(null, null, line);
            });

            request(createServer(':latency_human', {stream: stream}))
                .get('/')
                .expect(200, cb);
        });

    });

    describe(':bytes_in', function () {
        it('should return the bytes_in of the body', function (done) {
            var cb = after(2, function (err, res, line) {
                if (err) return done(err);
                equal(line, 20);
                done();
            });

            var stream = createLineStream(function (line) {
                cb(null, null, line);
            });

            request(createServer(':bytes_in[content-length]', {stream: stream}))
                .get('/')
                .set('content-length', '20')
                .expect(200, cb);
        });

    });

    describe(':bytes_out', function () {
        it('should return the bytes_out of the body', function (done) {
            var cb = after(2, function (err, res, line) {
                equal(line, 20);
                done();
            });

            var stream = createLineStream(function (line) {
                cb(null, null, line);
            });

            var server = createServer(':bytes_out[content-length]', {stream: stream}, function (req, res) {
                res.setHeader('content-length', '20');
                done();
            });

            request(server)
                .get('/')
                .expect(200, cb);
        });

    });

    describe(':caller_method', function () {
        it('should return the caller_method of the request', function (done) {
            var cb = after(2, function (err, res, line) {
                if (err) return done(err);

                equal(line.includes("src/lib/logging/custom.js"), true);
                done();
            });

            var stream = createLineStream(function (line) {
                cb(null, null, line);
            });

            request(createServer(':caller_method', {stream: stream}))
                .get('/')
                .expect(200, cb);
        });

    });

    describe(':request-body', function () {
        it('should return the latency in human format', function (done) {
            var cb = after(2, function (err, res, line) {
                if (err) return done(err);
                equal("-", line);
                done();
            });

            var stream = createLineStream(function (line) {
                cb(null, null, line);
            });

            request(createServer(':request-body', {stream: stream}))
                .post('/')
                .expect(200, cb);
        });

    });
});


function after(count, callback) {
    var args = new Array(3);
    var i = 0;

    return function (err, arg1, arg2) {
        ok(i++ < count, 'callback called ' + count + ' times');

        args[0] = args[0] || err;
        args[1] = args[1] || arg1;
        args[2] = args[2] || arg2;

        if (count === i) {
            callback.apply(null, args);
        }
    };
}

function createLineStream(callback) {
    return split().on('data', callback);
}

function createRequestListener(format, opts, fn, fn1) {
    var logger = morgan(format, opts);
    var middle = fn || noopMiddleware;

    return function onRequest(req, res) {
        // prior alterations
        if (fn1) {
            fn1(req, res);
        }

        logger(req, res, function onNext(err) {
            // allow req, res alterations
            middle(req, res, function onDone() {
                if (err) {
                    res.statusCode = 500;
                    res.end(err.message);
                }

                res.setHeader('X-Sent', 'true');
                res.end((req.connection && req.connection.remoteAddress) || '-');
            });
        });
    };
}

function createServer(format, opts, fn, fn1) {
    return _createServer()
        .on('request', createRequestListener(format, opts, fn, fn1));
}

function noopMiddleware(req, res, next) {
    next();
}
