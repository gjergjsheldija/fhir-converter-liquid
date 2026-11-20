# Open Integration Engine

[Features](../features.md)

`integrations/oie/hl7v2-to-fhir.xml` is a channel you import into Open Integration Engine. This server does not listen on TCP and does not speak MLLP. OIE receives the HL7 v2 message, then posts it to the converter.

## What the channel does

1. A sender opens TCP port `6661` on OIE and sends an HL7 v2 message. The source is a TCP Listener with `respondAfterProcessing` on, so the sender waits for the channel to finish.
2. The destination is one HTTP Sender. It POSTs to `127.0.0.1` port `2019`, path `/api/v1/convert/hl7v2`.
3. The body is `{"srcData":"<the raw message>","template":"ADT_A01"}`. The only message value in that body is the encoded data. The template name is the literal `ADT_A01`.
4. OIE can return an ACK to the sender. The channel file does not contain that ACK mapping.

Change `template` in the destination when the message is not an ADT A01. The converter route is the inline HL7 v2 route, so a `CONVERT_API_KEY` on the server applies to this call. The channel as shipped does not send an `Authorization` header.

## What is documented but not in the channel

[integrations/oie/README.md](../../integrations/oie/README.md) shows the ACK that should go back to the sender. MSA-2 is the inbound MSH-10. For an inbound control id `MSG00001`, that field is `MSA|AA|MSG00001`.

That control id is not read by an expression in the channel XML. The channel also does not write the raw message to a file. Both need a later change that names MSH-10 inside the channel. This server still does not archive the message itself. A failed call is recorded only as the [failure log](failure-log.md) describes: template, error, and MSH-10, not the body.
