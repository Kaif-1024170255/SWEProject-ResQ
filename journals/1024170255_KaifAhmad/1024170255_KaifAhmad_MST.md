# ResQ Project Journal --- Kaif Ahmad

**Role:** Backend Development / Technical Integration\
**Duration:** 4 Weeks

## Week 1 --- Backend Architecture

-   Studied the ResQ proposal and converted the functional requirements
    into backend responsibilities.
-   Planned the Express API structure, authentication flow, request
    lifecycle, authorization, and privacy handling.
-   Defined how the five user roles would interact with protected
    endpoints.
-   Coordinated the database model requirements with Tamanna and
    frontend requirements with Rishi.

## Week 2 --- Core Backend Implementation

-   Implemented the initial Express/TypeScript backend structure.
-   Worked on authentication using JWT and bcrypt.
-   Implemented core User and Request models with the database structure
    prepared by the team.
-   Added request creation and retrieval APIs.

## Week 3 --- Lifecycle, Authorization, and Privacy

-   Implemented the forward-only request lifecycle: **Unverified →
    Verified → In Progress → Resolved → Closed**.
-   Added role-based authorization for protected operations.
-   Implemented status-history recording for request transitions.
-   Worked on coordinate fuzzing and API response sanitization so
    precise location/contact information is not exposed to unauthorized
    users.
-   Tested invalid transitions and unauthorized actions.

## Week 4 --- Integration, Testing, and Debugging

-   Integrated backend APIs with the frontend.
-   Tested the complete request flow from submission to confirmation.
-   Added/fixed validation and error handling.
-   Used automated API tests to verify lifecycle transitions,
    authorization, and privacy behavior.
-   Coordinated final backend fixes and helped prepare the working
    prototype for demonstration.
