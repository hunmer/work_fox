import { getAIProvider } from './store'

export async function testProviderConnection(providerId: string): Promise<{ success: boolean; error?: string }> {
  const provider = getAIProvider(providerId)
  if (!provider) return { success: false, error: `Provider not found: ${providerId}` }

  try {
    const apiUrl = `${provider.apiBase.replace(/\/$/, '')}/v1/messages`
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': provider.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: provider.models[0]?.id ?? 'claude-sonnet-4-6-20250514',
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 10,
        stream: false,
      }),
    })

    if (response.ok) {
      return { success: true }
    }

    const errorText = await response.text()
    return { success: false, error: `HTTP ${response.status}: ${errorText}` }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}
