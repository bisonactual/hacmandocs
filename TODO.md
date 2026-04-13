# TODO — HACMan Docs System

## Authentication
- [ ] Set up GitHub OAuth app and configure OAUTH_CLIENT_ID/SECRET in .dev.vars and production secrets
- [ ] Add Google OAuth login support
- [ ] Point MEMBER_API_URL at the actual makerspace member auth endpoint (currently using dev bypass)
- [ ] Remove dev bypass login (admin/admin) before production deployment

## Production
- [ ] Set up Cloudflare account, create D1 database and KV namespace with real IDs
- [ ] Update wrangler.toml with real D1 database_id and KV namespace id
- [ ] Configure CORS origins for production domain (currently localhost only)
- [ ] Set up GitHub Pages custom domain
- [ ] Add CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID to GitHub repo secrets

## Features
- [ ] Email notifications (currently in-app only)
- [ ] Visibility group filtering on public document list (hide restricted docs from sidebar for non-members)
- [ ] User profile page / settings
- [ ] Document publish/unpublish workflow
- [ ] Bulk user import from makerspace member system
