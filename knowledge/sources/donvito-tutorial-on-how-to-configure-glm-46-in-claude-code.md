---
source: x-bookmarks
source_id: '1979597244895826086'
author: '@donvito'
url: 'https://x.com/donvito/status/1979597244895826086'
created: '2026-01-14'
triaged: '2026-01-16'
status: approved
confidence: 0.95
is_thread: true
has_images: true
---
# Tutorial on how to configure GLM 4.6 in Claude Code (bookmark it)

1. Install th

### Part 1

Tutorial on how to configure GLM 4.6 in Claude Code (bookmark it)

1. Install the latest Claude Code
npm install -g 
@anthropic
-ai/claude-code

2. Create an account in 
http://
z.ai and buy a coding plan at $3/mo. You can always upgrade later! Use my link 
http://
dub.sh/glm10off to save 10%

3. Create an API key here 
https://
z.ai/manage-apikey/
apikey-list
…. Copy the key and paste it in a text editor

4.  Edit ~/.claude/settings.json. Paste this. Make sure you update it with the new api key you created

{
    "env": {
        "ANTHROPIC_AUTH_TOKEN": "your_zai_api_key",
        "ANTHROPIC_BASE_URL": "
https://
api.z.ai/api/anthropic",
        "API_TIMEOUT_MS": "3000000",
        "ANTHROPIC_DEFAULT_HAIKU_MODEL": "glm-4.5-air",
        "ANTHROPIC_DEFAULT_SONNET_MODEL": "glm-4.6",
        "ANTHROPIC_DEFAULT_OPUS_MODEL": "glm-4.6"
    }
}

5. Switching between Claude Plans and GLM, try this

https://
github.com/foreveryh/clau
de-code-switch
…. I haven't tried this because I just use GLM

6. Run Claude Code and enjoy!

---

### Part 2

Enjoyed this post?

Follow me 
@donvito
 for more AI

## Triage Notes

**Decision**: Approved  
**Confidence**: 95%  
**Reason**: The content is a legitimate tutorial on configuring GLM in Claude Code and appears to be from an authoritative source.

