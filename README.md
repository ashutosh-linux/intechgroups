# intechgroups

Intech Groups multi-venture portal with a Node.js, Express, Mongoose, MongoDB, and Multer backend.

## Deployment

1. Install Node.js and MongoDB connectivity on the server.
2. Copy `.env.example` to `.env`.
3. Set the production `MONGODB_URI`, admin credentials, and a strong `JWT_SECRET`.
4. Install dependencies and start with PM2:

```bash
npm ci
pm2 start ecosystem.config.js
```

Uploaded files are stored on the EC2 disk under `public/uploads/`; `.env`, `node_modules`, and uploaded files are excluded from Git.
