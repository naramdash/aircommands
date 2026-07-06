# Server API Spec

## Endpoint

```http
POST /api/apps/open
```

## Request

```json
{
  "app": "chrome",
  "source": "gesture",
  "gesture": "touch_left_thumb_right_index",
  "clientRequestId": "touch_left_thumb_right_index-chrome-12345"
}
```

Only `app` is required. `gesture`, `source`, and `clientRequestId` are metadata
used by the client and dedupe logic.

## Success Response

```json
{
  "success": true,
  "app": "chrome",
  "message": "chrome opened successfully",
  "requestId": "touch_left_thumb_right_index-chrome-12345"
}
```

## Error Responses

| Error | Meaning |
| --- | --- |
| `INVALID_BODY` | Missing or invalid app name. |
| `APPLICATION_NOT_FOUND` | App is not in the allowlist. |
| `DUPLICATE_REQUEST` | Same request id was recently processed. |
| `EXECUTION_FAILED` | OS command returned failure. |

## Security Boundary

The API does not run arbitrary commands from the request body. It maps `app` to
an allowlisted command in `server/utils/apps.ts`.
