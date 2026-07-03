const {
  DynamoDBClient,
  PutItemCommand,
  GetItemCommand,
  QueryCommand,
  UpdateItemCommand,
  DeleteItemCommand
} = require("@aws-sdk/client-dynamodb");
const crypto = require("crypto");

const ddb = new DynamoDBClient({});
const TABLE_NAME = process.env.TABLE_NAME;

const corsHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
};

const json = (statusCode, body) => ({
  statusCode,
  headers: corsHeaders,
  body: statusCode === 204 ? "" : JSON.stringify(body)
});

function getUserId(event) {
  const claims = event.requestContext?.authorizer?.claims;

  if (claims?.sub) {
    return claims.sub;
  }

  // Temporary fallback while Cognito authorizers are being wired in SAM.
  // Remove this after API Gateway is fully protected by Cognito.
  return "demo-user";
}

function noteFromItem(item) {
  return {
    noteId: item.noteId.S,
    title: item.title?.S || "",
    content: item.content?.S || "",
    createdAt: item.createdAt?.S || "",
    updatedAt: item.updatedAt?.S || ""
  };
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod === "OPTIONS") {
      return json(200, { message: "OK" });
    }

    const route = `${event.httpMethod} ${event.resource}`;
    const body = event.body ? JSON.parse(event.body) : null;
    const userId = getUserId(event);

    if (route === "GET /notes") {
      const data = await ddb.send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "userId = :userId",
        ExpressionAttributeValues: {
          ":userId": { S: userId }
        },
        ScanIndexForward: false
      }));

      const items = (data.Items || []).map(noteFromItem);
      return json(200, items);
    }

    if (route === "GET /notes/{noteId}") {
      const noteId = event.pathParameters.noteId;
      const data = await ddb.send(new GetItemCommand({
        TableName: TABLE_NAME,
        Key: {
          userId: { S: userId },
          noteId: { S: noteId }
        }
      }));

      if (!data.Item) return json(404, { message: "Not found" });
      return json(200, noteFromItem(data.Item));
    }

    if (route === "POST /notes") {
      if (!body?.title) return json(400, { message: "title is required" });

      const noteId = crypto.randomUUID();
      const now = new Date().toISOString();

      const item = {
        userId: { S: userId },
        noteId: { S: noteId },
        title: { S: body.title },
        content: { S: body.content || "" },
        createdAt: { S: now },
        updatedAt: { S: now }
      };

      await ddb.send(new PutItemCommand({
        TableName: TABLE_NAME,
        Item: item
      }));

      return json(201, {
        noteId,
        title: body.title,
        content: body.content || "",
        createdAt: now,
        updatedAt: now
      });
    }

    if (route === "PUT /notes/{noteId}") {
      const noteId = event.pathParameters.noteId;
      if (!body) return json(400, { message: "body required" });

      const expr = [];
      const names = {};
      const values = {};

      if (typeof body.title === "string") {
        expr.push("#t = :t");
        names["#t"] = "title";
        values[":t"] = { S: body.title };
      }

      if (typeof body.content === "string") {
        expr.push("#c = :c");
        names["#c"] = "content";
        values[":c"] = { S: body.content };
      }

      if (!expr.length) return json(400, { message: "nothing to update" });

      const now = new Date().toISOString();
      expr.push("#u = :u");
      names["#u"] = "updatedAt";
      values[":u"] = { S: now };

      await ddb.send(new UpdateItemCommand({
        TableName: TABLE_NAME,
        Key: {
          userId: { S: userId },
          noteId: { S: noteId }
        },
        UpdateExpression: "SET " + expr.join(", "),
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ConditionExpression: "attribute_exists(userId) AND attribute_exists(noteId)"
      }));

      return json(200, {
        noteId,
        ...(typeof body.title === "string" ? { title: body.title } : {}),
        ...(typeof body.content === "string" ? { content: body.content } : {}),
        updatedAt: now
      });
    }

    if (route === "DELETE /notes/{noteId}") {
      const noteId = event.pathParameters.noteId;

      await ddb.send(new DeleteItemCommand({
        TableName: TABLE_NAME,
        Key: {
          userId: { S: userId },
          noteId: { S: noteId }
        },
        ConditionExpression: "attribute_exists(userId) AND attribute_exists(noteId)"
      }));

      return json(204, {});
    }

    return json(404, { message: "Route not found", route });
  } catch (err) {
    console.error(JSON.stringify({
      message: err.message,
      name: err.name,
      stack: err.stack
    }));

    if (err.name === "ConditionalCheckFailedException") {
      return json(404, { message: "Not found" });
    }

    return json(500, { message: "Server error", error: err.message });
  }
};