import { query, update, sparqlEscapeString, sparqlEscapeUri, sparqlEscapeDateTime } from 'mu';

const SESSIONS_GRAPH = 'http://mu.semte.ch/graphs/sessions';
const ACCOUNT_BASE_URI = 'http://data.lblod.info/id/accounts/';

export async function ensureUserAccount(userInfo) {
  const result = await query(`
    PREFIX foaf: <http://xmlns.com/foaf/0.1/>
    PREFIX ext:  <http://mu.semte.ch/vocabularies/ext/>

    SELECT ?uri WHERE {
      GRAPH ${sparqlEscapeUri(SESSIONS_GRAPH)} {
        ?uri a foaf:OnlineAccount ;
             ext:acmId ${sparqlEscapeString(userInfo.sub)} .
      }
    } LIMIT 1
  `);

  if (result.results.bindings.length > 0) {
    return result.results.bindings[0].uri.value;
  }

  const accountId = crypto.randomUUID();
  const accountUri = `${ACCOUNT_BASE_URI}${accountId}`;

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
          foaf:accountName ${sparqlEscapeString(userInfo.preferred_username || userInfo.sub)} .
      }
    }
  `);

  return accountUri;
}

export async function createSession(accountUri) {
  const sessionId = crypto.randomUUID();
  const sessionUri = `http://mu.semte.ch/sessions/${sessionId}`;
  const now = new Date();

  await update(`
    PREFIX mu:      <http://mu.semte.ch/vocabularies/core/>
    PREFIX ext:     <http://mu.semte.ch/vocabularies/ext/>
    PREFIX dcterms: <http://purl.org/dc/terms/>

    INSERT DATA {
      GRAPH ${sparqlEscapeUri(SESSIONS_GRAPH)} {
        ${sparqlEscapeUri(sessionUri)}
          mu:uuid ${sparqlEscapeString(sessionId)} ;
          ext:sessionAccount ${sparqlEscapeUri(accountUri)} ;
          dcterms:created ${sparqlEscapeDateTime(now)} ;
          dcterms:modified ${sparqlEscapeDateTime(now)} .
      }
    }
  `);

  return sessionId;
}

export async function deleteSession(sessionId) {
  await update(`
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

    DELETE {
      GRAPH ${sparqlEscapeUri(SESSIONS_GRAPH)} {
        ?session ?p ?o .
      }
    } WHERE {
      GRAPH ${sparqlEscapeUri(SESSIONS_GRAPH)} {
        ?session mu:uuid ${sparqlEscapeString(sessionId)} ;
          ?p ?o .
      }
    }
  `);
}
