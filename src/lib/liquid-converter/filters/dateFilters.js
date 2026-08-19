// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------
import { getNamespace } from "cls-hooked";
import { CLS_NAMESPACE, TIMEZONE } from "../../constants/constants.js";

function validDate(year, monthIndex, day) {
    var dateInstance = new Date(year, monthIndex, day);
    return dateInstance.getFullYear() === Number(year)
        && dateInstance.getMonth() === Number(monthIndex)
        && dateInstance.getDate() === Number(day);
}

function validUTCDateTime(c) {
    for (var key in c) c[key] = Number(c[key]);
    var d = new Date(Date.UTC(c.year, c.month - 1, c.day, c.hours, c.minutes, c.seconds, c.milliseconds));
    return d.getUTCFullYear() === c.year && d.getUTCMonth() === c.month - 1
        && d.getUTCDate() === c.day && d.getUTCHours() === c.hours
        && d.getUTCMinutes() === c.minutes && d.getSeconds() === c.seconds
        && d.getMilliseconds() === c.milliseconds;
}

function validDatetimeString(dateTimeString) {
    if (!dateTimeString || dateTimeString.toString() === '') return false;
    var ds = dateTimeString.toString();
    if (!/^(\d{4}(\d{2}(\d{2}(\d{2}(\d{2}(\d{2}(\.\d+)?)?)?)?)?)?((-|\+)\d{1,4})?)$/.test(ds)) {
        throw `Bad input for Datetime type in ${ds}`;
    }
    return true;
}

function convertDate(dateString) {
    if (dateString.length === 4) return dateString;
    if (dateString.length === 6 || dateString.length >= 8) {
        var year = dateString.substring(0, 4);
        var month = dateString.substring(4, 6);
        if (month <= 0 || month > 12) throw `Invalid month: ${dateString}`;
        if (dateString.length === 6) return year + '-' + month;
        var day = dateString.substring(6, 8);
        if (!validDate(year, month - 1, day)) throw `Invalid day: ${dateString}`;
        return year + '-' + month + '-' + day;
    }
    throw `Bad input for Date type in ${dateString}`;
}

function getDateTimeComposition(ds) {
    ds = ds.replace('.', '').padEnd(17, '0');
    return {
        year: ds.substring(0, 4), month: ds.substring(4, 6), day: ds.substring(6, 8),
        hours: ds.substring(8, 10), minutes: ds.substring(10, 12), seconds: ds.substring(12, 14),
        milliseconds: ds.substring(14, 17)
    };
}

export function addHyphensDate(dateString) {
    if (!validDatetimeStringSafe(dateString)) return '';
    return convertDate(dateString.toString());
}

function validDatetimeStringSafe(dateTimeString) {
    try {
        return validDatetimeString(dateTimeString);
    } catch (err) {
        return false;
    }
}

export function formatAsDateTime(dateTimeString) {
    var session = getNamespace(CLS_NAMESPACE);
    var timezoneFromParams = (session && session.get(TIMEZONE)) || "";
    if (!validDatetimeStringSafe(dateTimeString)) return '';

    var ds = dateTimeString.toString();
    if (timezoneFromParams != "") {
        var c = getDateTimeComposition(ds);
        var date = c.year + '-' + c.month + '-' + c.day;
        var time = c.hours + ':' + c.minutes + ':' + c.seconds + ':' + c.milliseconds;
        if (!validUTCDateTime(c)) throw `Invalid datetime: ${ds}`;
        return new Date(date + ' ' + time + ' ' + timezoneFromParams).toISOString();
    }

    var timeZoneChar = '';
    if (ds.indexOf('-') !== -1) timeZoneChar = '-';
    else if (ds.indexOf('+') !== -1) timeZoneChar = '+';

    if (timeZoneChar !== '') {
        var sections = ds.split(timeZoneChar);
        var cTz = getDateTimeComposition(sections[0]);
        var dateTz = cTz.year + '-' + cTz.month + '-' + cTz.day;
        var timeTz = cTz.hours + ':' + cTz.minutes + ':' + cTz.seconds;
        if (!validUTCDateTime(cTz)) throw `Invalid datetime: ${ds}`;
        
        // Preserve the original timezone offset, formatting as ±HH:MM (FHIR format)
        var tzOffset = sections[1].padEnd(4, '0'); // Ensure at least 4 digits (e.g., "+00" → "0000")
        var tzFormatted = timeZoneChar + tzOffset.substring(0, 2) + ':' + tzOffset.substring(2, 4);
        
        return dateTz + 'T' + timeTz + tzFormatted;
    }

    if (ds.length <= 8) return convertDate(ds);

    var c2 = getDateTimeComposition(ds);
    if (!validUTCDateTime(c2)) throw `Invalid datetime: ${ds}`;
    return (new Date(Date.UTC(c2.year, c2.month - 1, c2.day, c2.hours, c2.minutes, c2.seconds, c2.milliseconds))).toJSON();
}

export function nowFilter() {
    return new Date().toISOString();
}

const MS_PER_UNIT = { day: 86400000, hour: 3600000, minute: 60000, second: 1000 };

export function dateAdd(dateTimeString, amount, unit) {
    var msPerUnit = MS_PER_UNIT[unit];
    if (!msPerUnit) throw `Unsupported date_add unit: ${unit}`;
    var d = new Date(dateTimeString);
    return new Date(d.getTime() + Number(amount) * msPerUnit).toISOString();
}
