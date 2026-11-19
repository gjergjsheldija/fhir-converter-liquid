# Open Integration Engine channel: HL7 v2 to FHIR

`hl7v2-to-fhir.xml` is an Open Integration Engine (OIE) channel you can import.

This Node server does not listen on TCP and does not speak MLLP. OIE receives the HL7 v2 message on its TCP Listener source, then posts it to the converter at `http://127.0.0.1:2019/api/v1/convert/hl7v2`.

## Flow

1. The sender opens a TCP connection to OIE (port `6661` in the channel) and sends an HL7 v2 message.
2. The OIE HTTP Sender destination POSTs JSON `{"srcData":"<raw HL7 v2>","template":"<root template>"}` to the converter.
3. OIE returns an HL7 v2 ACK to the sender.

Set `template` in the destination to the root template for your message type, for example `ADT_A01`.

## ACK

The ACK echoes the inbound control id. MSA-2 must equal the inbound `MSH-10`.

Inbound:

```text
MSH|^~\&|SENDER|FAC|OIE|FAC|20261119120000||ADT^A01|MSG00001|P|2.5
PID|1||12345^^^HOSP^MR||DOE^JANE
```

ACK:

```text
MSH|^~\&|OIE|FAC|SENDER|FAC|20261119120001||ACK|ACK00001|P|2.5
MSA|AA|MSG00001
```

Here `MSG00001` is the inbound `MSH-10` and is carried in MSA-2.
