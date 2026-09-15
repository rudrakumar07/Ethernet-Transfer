export interface IdentityCertificate {
  certPem: string;
  keyPem: string;
  fingerprint: string;
}

/** Creates the self-signed device certificate. Real impl uses @peculiar/x509 + WebCrypto. */
export interface CertificateFactory {
  createSelfSigned(commonName: string): Promise<IdentityCertificate>;
  fingerprintOf(certPem: string): Promise<string>;
}
