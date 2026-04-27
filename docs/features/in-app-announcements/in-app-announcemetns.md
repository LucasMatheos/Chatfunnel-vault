I need help designing a new ChatFunnel feature called In-app Campaigns.

Context:
When a customer logs into ChatFunnel, the system may show a modal.
This modal can be:
1. a simple announcement
2. a confirmation prompt
3. a dynamic form

Admins must be able to:
- create campaigns
- edit campaigns
- activate/deactivate campaigns
- define if the modal is blocking or dismissible
- configure when it should appear
- build a simple dynamic form with configurable fields

Customers must be able to:
- see the modal on login if eligible
- dismiss it if allowed
- submit the form if required

I want you to help me brainstorm and design this feature from a product and architecture perspective.

Please provide:
1. better naming alternatives than “banner”
2. product scope for MVP and future iterations
3. recommended domain model and entities
4. suggested database schema
5. recommendation on whether to store form schema and responses as JSON/JSONB
6. how to handle versioning if the admin edits a form after responses already exist
7. delivery tracking model (shown, dismissed, completed)
8. eligibility logic for showing the modal on login
9. tradeoffs and risks
10. a practical implementation plan for frontend + backend

Assume we use:
- Vue 3 on frontend
- a backend with PostgreSQL
- admin and customer areas
- a need to keep the feature scalable for future in-app announcements and forms