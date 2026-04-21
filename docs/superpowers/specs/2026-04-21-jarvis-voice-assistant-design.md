# Jarvis Voice Assistant – Design Spec

**Date:** 2026-04-21

## Goal

A always-on macOS voice assistant that wakes on "ciao jarvis", understands Italian questions about Oura Ring health data, and responds vocally in Italian.

## Project

New standalone project at `~/Developer/jarvis/` — separate from the OuraClaw plugin repo.

## Stack

| Component | Technology |
|---|---|
| Framework | OpenClaw (installed globally) |
| Wake word | OpenClaw `VoiceWakeRuntime` — phrase: "ciao jarvis" |
| STT | OpenAI Whisper (via OpenClaw) |
| LLM | Anthropic Claude (via OpenClaw) |
| Health data | OuraClaw plugin (installed from `~/Developer/OuraClaw`) |
| TTS | OpenAI `tts-1` (via OpenClaw) |

## Project Structure

```
jarvis/
├── openclaw.json     # Technical config: providers, TTS, STT, wake word
├── AGENTS.md         # Agent workspace definition
├── SOUL.md           # Personality: Italian, concise, Jarvis-like
├── IDENTITY.md       # Agent name and characteristics
├── TOOLS.md          # Declares OuraClaw plugin
└── USER.md           # User profile (Dany, Italian, Oura Ring user)
```

## Voice Loop

1. OpenClaw runs in background, `VoiceWakeRuntime` listens for "ciao jarvis"
2. On trigger: 0.55s pause, records voice question
3. Whisper transcribes (Italian auto-detected)
4. Claude receives transcription with OuraClaw tool active
5. Claude calls `oura_data` if health data is needed → fetches from Oura API
6. Claude formulates Italian response
7. OpenAI `tts-1` speaks it back

## Configuration

### openclaw.json

```json
{
  "messages": {
    "tts": {
      "auto": "always",
      "provider": "openai",
      "providers": {
        "openai": {
          "model": "tts-1",
          "voice": "onyx"
        }
      }
    }
  },
  "talk": {
    "stt": {
      "provider": "openai-whisper"
    },
    "swabbleTriggerWords": ["ciao jarvis"]
  },
  "models": {
    "default": "claude-sonnet-4-6"
  }
}
```

### SOUL.md

Instructs the agent to:
- Always respond in Italian
- Be concise and direct (Jarvis-style)
- Focus on health insights when Oura data is available

## Environment Variables Required

- `OPENAI_API_KEY` — for Whisper STT and TTS
- `ANTHROPIC_API_KEY` — for Claude LLM
- `OURA_ACCESS_TOKEN` — for OuraClaw Oura API calls

## Out of Scope

- LaunchAgent auto-start on login
- Multiple wake phrases
- Non-Oura questions / general conversation
- Phone/Twilio integration
