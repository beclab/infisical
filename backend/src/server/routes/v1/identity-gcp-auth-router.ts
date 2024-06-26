import { z } from "zod";

import { IdentityGcpAuthsSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { TIdentityTrustedIp } from "@app/services/identity/identity-types";
import { validateGcpAuthField } from "@app/services/identity-gcp-auth/identity-gcp-auth-validators";

export const registerIdentityGcpAuthRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/gcp-auth/login",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Login with GCP Auth",
      body: z.object({
        identityId: z.string(),
        jwt: z.string()
      }),
      response: {
        200: z.object({
          accessToken: z.string(),
          expiresIn: z.coerce.number(),
          accessTokenMaxTTL: z.coerce.number(),
          tokenType: z.literal("Bearer")
        })
      }
    },
    handler: async (req) => {
      const { identityGcpAuth, accessToken, identityAccessToken, identityMembershipOrg } =
        await server.services.identityGcpAuth.login(req.body);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: identityMembershipOrg?.orgId,
        event: {
          type: EventType.LOGIN_IDENTITY_GCP_AUTH,
          metadata: {
            identityId: identityGcpAuth.identityId,
            identityAccessTokenId: identityAccessToken.id,
            identityGcpAuthId: identityGcpAuth.id
          }
        }
      });

      return {
        accessToken,
        tokenType: "Bearer" as const,
        expiresIn: identityGcpAuth.accessTokenTTL,
        accessTokenMaxTTL: identityGcpAuth.accessTokenMaxTTL
      };
    }
  });

  server.route({
    method: "POST",
    url: "/gcp-auth/identities/:identityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Attach GCP Auth configuration onto identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().trim()
      }),
      body: z.object({
        type: z.enum(["iam", "gce"]),
        allowedServiceAccounts: validateGcpAuthField,
        allowedProjects: validateGcpAuthField,
        allowedZones: validateGcpAuthField,
        accessTokenTrustedIps: z
          .object({
            ipAddress: z.string().trim()
          })
          .array()
          .min(1)
          .default([{ ipAddress: "0.0.0.0/0" }, { ipAddress: "::/0" }]),
        accessTokenTTL: z
          .number()
          .int()
          .min(1)
          .refine((value) => value !== 0, {
            message: "accessTokenTTL must have a non zero number"
          })
          .default(2592000),
        accessTokenMaxTTL: z
          .number()
          .int()
          .refine((value) => value !== 0, {
            message: "accessTokenMaxTTL must have a non zero number"
          })
          .default(2592000),
        accessTokenNumUsesLimit: z.number().int().min(0).default(0)
      }),
      response: {
        200: z.object({
          identityGcpAuth: IdentityGcpAuthsSchema
        })
      }
    },
    handler: async (req) => {
      const identityGcpAuth = await server.services.identityGcpAuth.attachGcpAuth({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body,
        identityId: req.params.identityId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: identityGcpAuth.orgId,
        event: {
          type: EventType.ADD_IDENTITY_GCP_AUTH,
          metadata: {
            identityId: identityGcpAuth.identityId,
            type: identityGcpAuth.type,
            allowedServiceAccounts: identityGcpAuth.allowedServiceAccounts,
            allowedProjects: identityGcpAuth.allowedProjects,
            allowedZones: identityGcpAuth.allowedZones,
            accessTokenTTL: identityGcpAuth.accessTokenTTL,
            accessTokenMaxTTL: identityGcpAuth.accessTokenMaxTTL,
            accessTokenTrustedIps: identityGcpAuth.accessTokenTrustedIps as TIdentityTrustedIp[],
            accessTokenNumUsesLimit: identityGcpAuth.accessTokenNumUsesLimit
          }
        }
      });

      return { identityGcpAuth };
    }
  });

  server.route({
    method: "PATCH",
    url: "/gcp-auth/identities/:identityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Update GCP Auth configuration on identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().trim()
      }),
      body: z.object({
        type: z.enum(["iam", "gce"]).optional(),
        allowedServiceAccounts: validateGcpAuthField,
        allowedProjects: validateGcpAuthField,
        allowedZones: validateGcpAuthField,
        accessTokenTrustedIps: z
          .object({
            ipAddress: z.string().trim()
          })
          .array()
          .min(1)
          .optional(),
        accessTokenTTL: z.number().int().min(0).optional(),
        accessTokenNumUsesLimit: z.number().int().min(0).optional(),
        accessTokenMaxTTL: z
          .number()
          .int()
          .refine((value) => value !== 0, {
            message: "accessTokenMaxTTL must have a non zero number"
          })
          .optional()
      }),
      response: {
        200: z.object({
          identityGcpAuth: IdentityGcpAuthsSchema
        })
      }
    },
    handler: async (req) => {
      const identityGcpAuth = await server.services.identityGcpAuth.updateGcpAuth({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        ...req.body,
        identityId: req.params.identityId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: identityGcpAuth.orgId,
        event: {
          type: EventType.UPDATE_IDENTITY_GCP_AUTH,
          metadata: {
            identityId: identityGcpAuth.identityId,
            type: identityGcpAuth.type,
            allowedServiceAccounts: identityGcpAuth.allowedServiceAccounts,
            allowedProjects: identityGcpAuth.allowedProjects,
            allowedZones: identityGcpAuth.allowedZones,
            accessTokenTTL: identityGcpAuth.accessTokenTTL,
            accessTokenMaxTTL: identityGcpAuth.accessTokenMaxTTL,
            accessTokenTrustedIps: identityGcpAuth.accessTokenTrustedIps as TIdentityTrustedIp[],
            accessTokenNumUsesLimit: identityGcpAuth.accessTokenNumUsesLimit
          }
        }
      });

      return { identityGcpAuth };
    }
  });

  server.route({
    method: "GET",
    url: "/gcp-auth/identities/:identityId",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Retrieve GCP Auth configuration on identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string()
      }),
      response: {
        200: z.object({
          identityGcpAuth: IdentityGcpAuthsSchema
        })
      }
    },
    handler: async (req) => {
      const identityGcpAuth = await server.services.identityGcpAuth.getGcpAuth({
        identityId: req.params.identityId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: identityGcpAuth.orgId,
        event: {
          type: EventType.GET_IDENTITY_GCP_AUTH,
          metadata: {
            identityId: identityGcpAuth.identityId
          }
        }
      });

      return { identityGcpAuth };
    }
  });
};
