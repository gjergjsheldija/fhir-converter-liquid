export const errorCodes = {
    BadRequest: "BadRequest",
    Conflict: "Conflict",
    NotFound: "NotFound",
    WriteError: "WriteError",
    Unauthorized: "Unauthorized"
};

// Error message
export function errorMessage (errorCode, errorMessage)
{
    return { error: { code: errorCode, message: errorMessage} };
}
