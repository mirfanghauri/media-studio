"use strict";

const crypto = require("crypto");

/**
 * AWS Signature Version 4 signing for Bedrock requests.
 */
function signV4({ method, hostname, path: urlPath, headers, body, region, service, accessKey, secretKey }) {
  const now = new Date();
  const dateStamp = now.toISOString().replace(/[:-]|\.\d{3}/g, "").substring(0, 8);
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "").substring(0, 15) + "Z";

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;

  const allHeaders = {
    ...headers,
    host: hostname,
    "x-amz-date": amzDate,
  };

  const sortedHeaderKeys = Object.keys(allHeaders).sort();
  const canonicalHeaders = sortedHeaderKeys
    .map((k) => `${k.toLowerCase()}:${allHeaders[k].trim()}`)
    .join("\n") + "\n";
  const signedHeaders = sortedHeaderKeys.map((k) => k.toLowerCase()).join(";");

  const payloadHash = sha256(body || "");

  const canonicalRequest = [
    method,
    urlPath,
    "", // query string
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256(canonicalRequest),
  ].join("\n");

  const signingKey = getSignatureKey(secretKey, dateStamp, region, service);
  const signature = hmac(signingKey, stringToSign).toString("hex");

  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    ...allHeaders,
    Authorization: authorization,
    "x-amz-date": amzDate,
    "x-amz-content-sha256": payloadHash,
  };
}

function sha256(data) {
  return crypto.createHash("sha256").update(data, "utf8").digest("hex");
}

function hmac(key, data) {
  return crypto.createHmac("sha256", key).update(data, "utf8").digest();
}

function getSignatureKey(key, dateStamp, region, service) {
  let k = hmac(`AWS4${key}`, dateStamp);
  k = hmac(k, region);
  k = hmac(k, service);
  k = hmac(k, "aws4_request");
  return k;
}

module.exports = { signV4 };
