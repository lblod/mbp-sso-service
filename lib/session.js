import { query, update, sparqlEscapeString, sparqlEscapeUri, sparqlEscapeDateTime } from 'mu';

const SESSIONS_GRAPH = 'http://mu.semte.ch/graphs/sessions';
const ACCOUNT_BASE_URI = 'http://data.lblod.info/id/accounts/';

export async function ensureUserAccount(userInfo) {
  const result = await query(`
    PREFIX foaf: <http://xmlns.com/foaf/0.1/>
    PREFIX ext:  <http://mu.semte.ch/vocabularies/ext/>

    SELECT ?uri ?rrn WHERE {
      GRAPH ${sparqlEscapeUri(SESSIONS_GRAPH)} {
        ?uri a foaf:OnlineAccount ;
             ext:acmId ${sparqlEscapeString(userInfo.sub)} .
        OPTIONAL { ?uri ext:rijksregisternummer ?rrn }
      }
    } LIMIT 1
  `);

  if (result.results.bindings.length > 0) {
    const binding = result.results.bindings[0];
    const accountUri = binding.uri.value;
    const storedRrn = binding.rrn?.value;

    if (userInfo.rrn && !storedRrn) {
      await update(`
        PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

        INSERT DATA {
          GRAPH ${sparqlEscapeUri(SESSIONS_GRAPH)} {
            ${sparqlEscapeUri(accountUri)} ext:rijksregisternummer ${sparqlEscapeString(userInfo.rrn)} .
          }
        }
      `);
    }

    return accountUri;
  }

  const accountId = crypto.randomUUID();
  const accountUri = `${ACCOUNT_BASE_URI}${accountId}`;

  const rrnTriple = userInfo.rrn
    ? `; ext:rijksregisternummer ${sparqlEscapeString(userInfo.rrn)}`
    : '';

  await update(`
    PREFIX foaf: <http://xmlns.com/foaf/0.1/>
    PREFIX mu:   <http://mu.semte.ch/vocabularies/core/>
    PREFIX ext:  <http://mu.semte.ch/vocabularies/ext/>

    INSERT DATA {
      GRAPH ${sparqlEscapeUri(SESSIONS_GRAPH)} {
        ${sparqlEscapeUri(accountUri)}
          a foaf:OnlineAccount ;
          mu:uuid ${sparqlEscapeString(accountId)} ;
          ext:acmId ${sparqlEscapeString(userInfo.sub)} ;
          foaf:accountName ${sparqlEscapeString(userInfo.preferred_username || userInfo.sub)}
          ${rrnTriple} .
      }
    }
  `);

  return accountUri;
}

export async function createSession(sessionUri, accountUri) {
  const now = new Date();

  await update(`
    PREFIX ext:     <http://mu.semte.ch/vocabularies/ext/>
    PREFIX dcterms: <http://purl.org/dc/terms/>

    INSERT DATA {
      GRAPH ${sparqlEscapeUri(SESSIONS_GRAPH)} {
        ${sparqlEscapeUri(sessionUri)}
          ext:sessionAccount ${sparqlEscapeUri(accountUri)} ;
          dcterms:created ${sparqlEscapeDateTime(now)} ;
          dcterms:modified ${sparqlEscapeDateTime(now)} .
      }
    }
  `);
}

export async function deleteSession(sessionUri) {
  await update(`
    DELETE {
      GRAPH ${sparqlEscapeUri(SESSIONS_GRAPH)} {
        ${sparqlEscapeUri(sessionUri)} ?p ?o .
      }
    } WHERE {
      GRAPH ${sparqlEscapeUri(SESSIONS_GRAPH)} {
        ${sparqlEscapeUri(sessionUri)} ?p ?o .
      }
    }
  `);
}
