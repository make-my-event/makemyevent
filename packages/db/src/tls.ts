/**
 * Encrypted, verified connections to Supabase.
 *
 * Supabase's databases present certificates signed by Supabase's own root
 * authority, which no operating system trusts by default. node-postgres
 * checks the chain and refuses ("self-signed certificate in certificate
 * chain"). The answer is to trust that one root, never to switch checking
 * off: with verification off, anyone between the server and the database
 * could read or change the traffic.
 *
 * The root is public (anyone can download it from a Supabase project's
 * Database settings) and holds no secret. It is kept here as text so it
 * ships inside the server bundle on every platform.
 *
 *   Supabase Root 2021 CA, valid until 2031-04-26
 *   SHA-256 80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:
 *           82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA
 */
export const SUPABASE_ROOT_CA = `-----BEGIN CERTIFICATE-----
MIIDxDCCAqygAwIBAgIUbLxMod62P2ktCiAkxnKJwtE9VPYwDQYJKoZIhvcNAQEL
BQAwazELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5l
dyBDYXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJh
c2UgUm9vdCAyMDIxIENBMB4XDTIxMDQyODEwNTY1M1oXDTMxMDQyNjEwNTY1M1ow
azELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5ldyBD
YXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJhc2Ug
Um9vdCAyMDIxIENBMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqQXW
QyHOB+qR2GJobCq/CBmQ40G0oDmCC3mzVnn8sv4XNeWtE5XcEL0uVih7Jo4Dkx1Q
DmGHBH1zDfgs2qXiLb6xpw/CKQPypZW1JssOTMIfQppNQ87K75Ya0p25Y3ePS2t2
GtvHxNjUV6kjOZjEn2yWEcBdpOVCUYBVFBNMB4YBHkNRDa/+S4uywAoaTWnCJLUi
cvTlHmMw6xSQQn1UfRQHk50DMCEJ7Cy1RxrZJrkXXRP3LqQL2ijJ6F4yMfh+Gyb4
O4XajoVj/+R4GwywKYrrS8PrSNtwxr5StlQO8zIQUSMiq26wM8mgELFlS/32Uclt
NaQ1xBRizkzpZct9DwIDAQABo2AwXjALBgNVHQ8EBAMCAQYwHQYDVR0OBBYEFKjX
uXY32CztkhImng4yJNUtaUYsMB8GA1UdIwQYMBaAFKjXuXY32CztkhImng4yJNUt
aUYsMA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBAB8spzNn+4VU
tVxbdMaX+39Z50sc7uATmus16jmmHjhIHz+l/9GlJ5KqAMOx26mPZgfzG7oneL2b
VW+WgYUkTT3XEPFWnTp2RJwQao8/tYPXWEJDc0WVQHrpmnWOFKU/d3MqBgBm5y+6
jB81TU/RG2rVerPDWP+1MMcNNy0491CTL5XQZ7JfDJJ9CCmXSdtTl4uUQnSuv/Qx
Cea13BX2ZgJc7Au30vihLhub52De4P/4gonKsNHYdbWjg7OWKwNv/zitGDVDB9Y2
CMTyZKG3XEu5Ghl1LEnI3QmEKsqaCLv12BnVjbkSeZsMnevJPs1Ye6TjjJwdik5P
o/bKiIz+Fq8=
-----END CERTIFICATE-----`;

/** Hosts Supabase serves databases from: direct and through its pooler. */
function isSupabaseHost(hostname: string): boolean {
	return (
		hostname.endsWith(".supabase.co") || hostname.endsWith(".supabase.com")
	);
}

/** sslmode values that ask for encryption. */
const ENCRYPTED = new Set(["require", "verify-ca", "verify-full", "prefer"]);

export type PoolOptions = {
	connectionString: string;
	ssl?: { ca?: string; rejectUnauthorized: true };
};

/**
 * The node-postgres pool options for a connection string.
 *
 * - A Supabase host is always encrypted and verified against Supabase's
 *   root, whatever the string says: there is no reason to talk to a cloud
 *   database in the clear.
 * - Another host that asks for encryption (sslmode) is verified against the
 *   system's trusted roots.
 * - Anything else (a local database) is left as written.
 *
 * sslmode is taken out of the string when the options carry `ssl`, because
 * node-postgres lets the string's own sslmode replace the `ssl` given here.
 */
export function poolOptions(connectionString: string): PoolOptions {
	const url = new URL(connectionString);
	const sslmode = url.searchParams.get("sslmode");
	const supabase = isSupabaseHost(url.hostname);
	if (!supabase && !(sslmode && ENCRYPTED.has(sslmode)))
		return { connectionString };
	for (const key of ["sslmode", "sslrootcert", "sslcert", "sslkey"])
		url.searchParams.delete(key);
	return {
		connectionString: url.toString(),
		ssl: supabase
			? { ca: SUPABASE_ROOT_CA, rejectUnauthorized: true }
			: { rejectUnauthorized: true },
	};
}
