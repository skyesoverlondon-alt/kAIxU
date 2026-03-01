# kAIxU SDKs

Official JS and Python clients for the kAIxU AI gateway.

---

## JavaScript / TypeScript

```js
import { KaixuClient } from './sdk/js/src/index.js';

const kai = new KaixuClient({ token: 'YOUR_TOKEN' });

// Generate (blocking)
const { text } = await kai.generate('Explain WebSockets in one paragraph.');

// Generate with options
const result = await kai.generate('Analyse microservices vs monolith.', {
  model: 'kAIxU-pro',
  system: 'You are a senior software architect.',
  generationConfig: { temperature: 0.7 },
});

// Multi-turn
const { text: reply } = await kai.generate({
  messages: [
    { role: 'user', content: 'My name is Skye.' },
    { role: 'assistant', content: 'Hello Skye!' },
    { role: 'user', content: 'What is my name?' },
  ],
});

// Streaming (not from Netlify-hosted apps)
for await (const chunk of kai.stream('Write a haiku about the ocean.')) {
  process.stdout.write(chunk);
}

// Embed
const result = await kai.embed('The quick brown fox.');
// result.embeddings[0].values → [0.023, -0.041, ...] (768 floats)

// Batch embed
const batch = await kai.embed(['First doc.', 'Second doc.', 'Third doc.']);

// Shortcut for single vector
const vector = await kai.embedValues('Hello world');

// Error handling
import { KaixuAuthError, KaixuQuotaError } from './sdk/js/src/index.js';
try {
  await kai.generate('...');
} catch (err) {
  if (err instanceof KaixuQuotaError) console.error('Quota exceeded');
  if (err instanceof KaixuAuthError)  console.error('Bad token');
}
```

---

## Python

```python
from kaixu import KaixuClient, KaixuAuthError, KaixuQuotaError

kai = KaixuClient(token="YOUR_TOKEN")

# Generate (blocking)
result = kai.generate("Explain WebSockets in one paragraph.")
print(result.text)
print(f"Tokens used: {result.total_tokens}")

# Generate with options
result = kai.generate(
    "Analyse microservices vs monolith.",
    model="kAIxU-pro",
    system="You are a senior software architect.",
    generation_config={"temperature": 0.7},
)

# Multi-turn
result = kai.generate({
    "messages": [
        {"role": "user",      "content": "My name is Skye."},
        {"role": "assistant", "content": "Hello Skye!"},
        {"role": "user",      "content": "What is my name?"},
    ]
})

# Streaming
for chunk in kai.stream("Write a haiku about the ocean."):
    print(chunk, end="", flush=True)

# Collect stream to string
full_text = kai.stream_collect("Write a poem.")

# Embed
result = kai.embed("The quick brown fox.")
vector = result.values  # list of 768 floats

# Batch embed
result = kai.embed(["First doc.", "Second doc.", "Third doc."])
for e in result.embeddings:
    print(e["index"], len(e["values"]))

# Shortcut for single vector
vector = kai.embed_values("Hello world")

# Error handling
try:
    result = kai.generate("...")
except KaixuQuotaError:
    print("Quota exceeded")
except KaixuAuthError:
    print("Bad token")
```

---

## Installation

### JS
```bash
# Copy sdk/js/src/index.js into your project, or:
npm install @kaixu/client   # once published to npm
```

### Python
```bash
# With httpx (recommended):
pip install httpx
pip install kaixu   # once published to PyPI

# With requests:
pip install requests
pip install kaixu
```

---

## Environment Variables

```bash
# Set once, reference everywhere
export KAIXU_TOKEN="your_token_here"
export KAIXU_BASE="https://kaixu67.skyesoverlondon.workers.dev"
```

```python
import os
kai = KaixuClient(token=os.environ["KAIXU_TOKEN"])
```

```js
const kai = new KaixuClient({ token: process.env.KAIXU_TOKEN });
```

Never commit tokens. Add to `.gitignore`, use env vars or secret managers.
