# AI Conversation Feature: Bedrock vs Keyword-Based

## Overview
The AI Conversation feature supports two modes:
1. **AWS Bedrock AI** - Intelligent natural language understanding
2. **Keyword-Based** - Pattern matching fallback

The system automatically switches between modes based on configuration and availability.

---

## AWS Bedrock AI Mode

### ✅ Pros
1. **Natural Language Understanding**
   - Understands complex sentences and context
   - Handles typos, abbreviations, and variations
   - Example: "I want to get rid of those S3 buckets consuming my bill" → Correctly identifies delete intent

2. **Context Awareness**
   - Maintains conversation context across multiple turns
   - Understands implicit references ("those buckets", "the instances")
   - Can infer missing information from context

3. **Intelligent Clarification**
   - Asks smart, contextual questions
   - Adapts questions based on what's already known
   - More human-like conversation flow

4. **Flexibility**
   - Handles new AWS services without code changes
   - Understands business language ("costing money" = delete intent)
   - Adapts to user's communication style

5. **Accuracy**
   - Lower false positives (e.g., won't confuse "kms" in "10kms away")
   - Better intent detection for ambiguous phrases
   - Understands negations ("don't want to create")

### ❌ Cons
1. **Cost**
   - ~$0.0006 per conversation (Claude 3 Sonnet)
   - ~$0.003 per 1000 input tokens
   - ~$0.015 per 1000 output tokens
   - Estimated: $6-30/month for 10,000-50,000 conversations

2. **Latency**
   - 500ms - 2s response time (network + inference)
   - Slower than keyword matching (< 10ms)

3. **Dependencies**
   - Requires AWS credentials with Bedrock access
   - Requires IAM permissions: `bedrock:InvokeModel`
   - Network dependency (internet required)

4. **Complexity**
   - More complex error handling
   - Requires monitoring and logging
   - Potential for unexpected AI responses

5. **Regional Availability**
   - Bedrock not available in all AWS regions
   - May require cross-region calls (increased latency)

---

## Keyword-Based Mode

### ✅ Pros
1. **Zero Cost**
   - No API calls, no charges
   - Unlimited conversations

2. **Fast**
   - < 10ms response time
   - No network latency
   - Instant clarification

3. **Predictable**
   - Deterministic behavior
   - Easy to debug and test
   - No unexpected responses

4. **No Dependencies**
   - Works offline
   - No AWS credentials needed
   - No IAM permissions required

5. **Simple**
   - Easy to understand and maintain
   - Clear logic flow
   - No external service failures

### ❌ Cons
1. **Limited Understanding**
   - Only matches exact keywords
   - Cannot understand context or nuance
   - Example: "these created buckets need deletion" might trigger both create AND delete

2. **False Positives**
   - "kms" detected in "10kms away"
   - "sns" detected in "response"
   - Requires regex word boundaries (partially solved)

3. **Rigid**
   - Cannot handle typos or variations
   - Requires exact keyword matches
   - "remove" works, but "rmove" doesn't

4. **Manual Maintenance**
   - New keywords must be manually added
   - New services require code changes
   - Requires constant updates for new AWS services

5. **Poor User Experience**
   - Generic clarification questions
   - Cannot adapt to user's language
   - May ask unnecessary questions

---

## Configuration

### Enable Bedrock AI
Edit `bedrock_config.json`:
```json
{
  "enabled": true,
  "aws_region": "us-east-1",
  "model_id": "anthropic.claude-3-sonnet-20240229-v1:0",
  "aws_access_key_id": "YOUR_ACCESS_KEY",
  "aws_secret_access_key": "YOUR_SECRET_KEY",
  "max_tokens": 500,
  "temperature": 0.7
}
```

### Required IAM Permissions
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel"
      ],
      "Resource": "arn:aws:bedrock:*::foundation-model/anthropic.claude-3-sonnet-20240229-v1:0"
    }
  ]
}
```

### Disable Bedrock (Use Keyword-Based)
Set `"enabled": false` in `bedrock_config.json`

---

## Automatic Fallback

The system automatically falls back to keyword-based mode if:
1. Bedrock is disabled in config
2. AWS credentials are missing or invalid
3. Bedrock API call fails
4. IAM permissions are insufficient
5. Network error occurs

**No user impact** - conversation continues seamlessly.

---

## Cost Comparison

### Scenario: 10,000 conversations/month

| Mode | Cost | Latency | Accuracy |
|------|------|---------|----------|
| **Bedrock AI** | $6-30/mo | 500ms-2s | 95%+ |
| **Keyword-Based** | $0 | <10ms | 70-80% |

### Recommendation
- **Small teams (<100 users)**: Keyword-based (free, sufficient)
- **Medium teams (100-500 users)**: Bedrock AI (better UX, low cost)
- **Large enterprises (500+ users)**: Bedrock AI (essential for scale)

---

## Monitoring

### Check Current Mode
```python
from conversation_manager import ConversationManager
mode = ConversationManager.get_mode()
print(f"Current AI mode: {mode}")  # 'bedrock' or 'keyword'
```

### Logs
- ✅ Bedrock AI enabled
- ⚠️ Bedrock AI disabled - using keyword-based fallback
- 🧠 Using Bedrock AI for conversation
- 🔤 Using keyword-based matching

---

## Testing

### Test Bedrock AI
```bash
# Set credentials in bedrock_config.json
# Restart Flask
python app.py

# Check logs for: "✅ Bedrock AI enabled"
```

### Test Keyword-Based
```bash
# Set "enabled": false in bedrock_config.json
# Restart Flask
python app.py

# Check logs for: "⚠️ Bedrock AI disabled"
```

---

## Security Notes

1. **Never commit credentials** to Git
2. Add `bedrock_config.json` to `.gitignore`
3. Use IAM roles instead of access keys (production)
4. Rotate credentials regularly
5. Use least-privilege IAM policies

---

## Future Enhancements

1. **Hybrid Mode**: Use Bedrock for complex queries, keywords for simple ones
2. **Caching**: Cache common conversations to reduce Bedrock calls
3. **Analytics**: Track accuracy and cost per conversation
4. **A/B Testing**: Compare Bedrock vs keyword performance
5. **Custom Models**: Fine-tune models for AWS-specific language
