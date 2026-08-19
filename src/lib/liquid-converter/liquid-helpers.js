import {generateUuid} from "./filters/generateUuid.js";
import {generateIdInput} from "./filters/generateIdInput.js";
import { getFirstSegments, getSegmentLists, getRelatedSegmentList, getParentSegment, hasSegments, splitDataBySegments } from "./filters/segmentFilters.js";
import { addHyphensDate, formatAsDateTime, nowFilter, dateAdd } from "./filters/dateFilters.js";
import { getProperty } from "./filters/getProperty.js";

export const external = [
    {
        name: 'generate_id_input',
        description: 'tbd',
        func: function (segment, resourceType, isBaseIdRequired, baseId) {
            return generateIdInput(segment, resourceType, isBaseIdRequired, baseId);
        }
    },
    {
        name: 'generate_uuid',
        description: 'Generates a guid based on a URL: generate_uuid url',
        func: function (urlNamespace) {
            return generateUuid(urlNamespace);
        }
    },
    {
        name: 'get_first_segments',
        description: 'Returns first instance of the segments',
        func: getFirstSegments
    },
    {
        name: 'get_segment_lists',
        description: 'Extracts HL7 v2 segments',
        func: getSegmentLists
    },
    {
        name: 'get_related_segment_list',
        description: 'Given a parent segment object reference and a child segment name, returns the collection of related named segments',
        func: getRelatedSegmentList
    },
    {
        name: 'get_parent_segment',
        description: 'Given a child segment name and overall message index, returns the first matched parent segment',
        func: getParentSegment
    },
    {
        name: 'has_segments',
        description: 'Checks if HL7 v2 message has segments',
        func: hasSegments
    },
    {
        name: 'split_data_by_segments',
        description: 'Splits an HL7 v2 message by segment name(s), retaining each separator as the first segment of the following sub-message',
        func: splitDataBySegments
    },
    {
        name: 'add_hyphens_date',
        description: 'Adds hyphens to a date without hyphens',
        func: addHyphensDate
    },
    {
        name: 'format_as_date_time',
        description: 'Converts HL7v2/CDA datetime to FHIR datetime format',
        func: formatAsDateTime
    },
    {
        name: 'now',
        description: 'Current time as a FHIR instant',
        func: nowFilter
    },
    {
        name: 'date_add',
        description: 'Adds a signed amount of a time unit (day/hour/minute/second) to an ISO datetime',
        func: dateAdd
    },
    {
        name: 'sign',
        description: 'Returns -1, 0, or 1 indicating the sign of a number',
        func: (x) => Math.sign(x)
    },
    {
        name: 'truncate_number',
        description: 'Returns the integer part of a number by removing any fractional digits',
        func: (x) => Math.trunc(x)
    },
    {
        name: 'divide',
        description: 'Divides first number by the second number and returns a double',
        func: (a, b) => Number(a) / Number(b)
    },
    {
        name: 'get_property',
        description: "Returns a specific property of a coding via the CodeSystem.json mapping file",
        func: getProperty
    },
    {
        name: 'split',
        description: 'Splits string by delimiter, filtering out empty strings (DotLiquid compat)',
        func: (str, delimiter) => {
            if (str == null) return [];
            return String(str).split(delimiter).filter(s => s !== '');
        }
    },
];
