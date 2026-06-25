import { NextResponse } from "next/server";
import { getProviderConnectionById, updateProviderConnection } from "@/models";
import { getModelAliases, setModelAlias } from "@/models";
import { isOpenAICompatibleProvider, isAnthropicCompatibleProvider } from "@/shared/constants/providers";
import { getProviderAlias } from "@/shared/constants/providers";
import { getProviderModels } from "../models/route";

/**
 * GET /api/providers/[id]/fetch-models
 * Fetch remote model list without saving. Returns models + existing model info for conflict detection.
 */
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const connection = await getProviderConnectionById(id);

    if (!connection) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }

    const data = await getProviderModels(connection);
    if (data.error) {
      return NextResponse.json({ error: data.error }, { status: data.status || 500 });
    }
    const remoteModels = data.models || [];

    // Determine existing enabled models
    const existingEnabled = connection.providerSpecificData?.enabledModels || [];

    // Determine existing aliases for this provider
    const allAliases = await getModelAliases();
    const providerAlias = getProviderAlias(connection.provider);
    const isCompatible = isOpenAICompatibleProvider(connection.provider) || isAnthropicCompatibleProvider(connection.provider);
    const storageAlias = isCompatible ? connection.provider : providerAlias;

    // Build a map of existing model IDs for this provider
    const existingModelIds = new Set();
    for (const [alias, fullModel] of Object.entries(allAliases)) {
      if (fullModel.startsWith(`${storageAlias}/`)) {
        existingModelIds.add(fullModel.slice(`${storageAlias}/`.length));
      }
    }

    // Also check enabledModels
    for (const m of existingEnabled) {
      existingModelIds.add(m);
    }

    // Build a map of alias -> fullModel across all providers for conflict detection
    const aliasToFullModel = { ...allAliases };

    // Normalize remote models
    const normalizedModels = remoteModels.map((m) => ({
      id: m.id || m.name || m.model || "",
      name: m.name || m.id || m.model || "",
      ...(m.contextLength ? { contextLength: m.contextLength } : {}),
      ...(m.description ? { description: m.description } : {}),
    })).filter((m) => m.id);

    // Deduplicate by id
    const seen = new Set();
    const uniqueModels = normalizedModels.filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });

    return NextResponse.json({
      connectionId: id,
      provider: connection.provider,
      providerAlias: storageAlias,
      isCompatible,
      models: uniqueModels,
      existingModelIds: [...existingModelIds],
      existingAliases: aliasToFullModel,
      warning: data.warning || null,
    });
  } catch (error) {
    console.log("Error in fetch-models GET:", error);
    return NextResponse.json({ error: error.message || "Failed to fetch models" }, { status: 500 });
  }
}

/**
 * POST /api/providers/[id]/fetch-models
 * Save selected models. For non-compatible providers, update enabledModels.
 * For compatible providers, create model aliases.
 */
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { connectionId, selectedModels } = body;

    const targetId = connectionId || id;
    const connection = await getProviderConnectionById(targetId);

    if (!connection) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }

    if (!Array.isArray(selectedModels) || selectedModels.length === 0) {
      return NextResponse.json({ error: "No models selected" }, { status: 400 });
    }

    const isCompatible = isOpenAICompatibleProvider(connection.provider) || isAnthropicCompatibleProvider(connection.provider);
    const providerAlias = getProviderAlias(connection.provider);
    const storageAlias = isCompatible ? connection.provider : providerAlias;

    const conflicts = [];
    const savedModels = [];

    if (isCompatible) {
      // For compatible providers, use alias mechanism
      const allAliases = await getModelAliases();

      for (const modelId of selectedModels) {
        const fullModel = `${storageAlias}/${modelId}`;
        // Check if alias already exists
        const existingAlias = Object.entries(allAliases).find(
          ([, v]) => v === fullModel
        );
        if (existingAlias) {
          conflicts.push({ modelId, reason: "alias_exists", alias: existingAlias[0] });
          continue;
        }

        // Generate alias: use last segment of modelId
        const parts = modelId.split("/");
        let alias = parts[parts.length - 1];

        // Check alias collision
        if (allAliases[alias]) {
          // Try prefixed alias
          const prefixedAlias = `${storageAlias}-${alias}`;
          if (allAliases[prefixedAlias]) {
            conflicts.push({ modelId, reason: "alias_conflict", alias });
            continue;
          }
          alias = prefixedAlias;
        }

        await setModelAlias(alias, fullModel);
        savedModels.push({ modelId, alias, fullModel });
      }
    } else {
      // For non-compatible providers, update enabledModels
      const existingEnabled = connection.providerSpecificData?.enabledModels || [];
      const newEnabled = [...new Set([...existingEnabled, ...selectedModels])];

      await updateProviderConnection(targetId, {
        providerSpecificData: {
          ...(connection.providerSpecificData || {}),
          enabledModels: newEnabled,
        },
      });

      savedModels.push(...selectedModels.map((modelId) => ({ modelId })));
    }

    // Check cross-provider model ID conflicts
    const allAliases = await getModelAliases();
    const allProvidersModels = {};
    for (const [alias, fullModel] of Object.entries(allAliases)) {
      const parts = fullModel.split("/");
      if (parts.length >= 2) {
        const modelId = parts.slice(1).join("/");
        if (!allProvidersModels[modelId]) {
          allProvidersModels[modelId] = [];
        }
        allProvidersModels[modelId].push(fullModel);
      }
    }

    const crossProviderConflicts = [];
    for (const modelId of selectedModels) {
      if (allProvidersModels[modelId] && allProvidersModels[modelId].length > 1) {
        crossProviderConflicts.push({
          modelId,
          providers: allProvidersModels[modelId],
        });
      }
    }

    return NextResponse.json({
      success: true,
      savedModels,
      conflicts: [
        ...conflicts,
        ...crossProviderConflicts.map((c) => ({
          modelId: c.modelId,
          reason: "cross_provider_conflict",
          providers: c.providers,
        })),
      ],
      totalSelected: selectedModels.length,
      totalSaved: savedModels.length,
    });
  } catch (error) {
    console.log("Error in fetch-models POST:", error);
    return NextResponse.json({ error: error.message || "Failed to save models" }, { status: 500 });
  }
}
