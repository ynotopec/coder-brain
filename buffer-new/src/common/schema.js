export class SchemaAndEmbedder {
  constructor(llm, vectorStore) {
    this.llm = llm;
    this.vectorStore = vectorStore;
  }

  async constructMemorySchema(input, response) {
    const prompt = `Extract structured schema for this memory.

Input: "${input}"
Response: "${response.answer}"

Return a JSON object with:
{
  "title": "title",
  "summary": "summary",
  "categories": ["category1", "category2"],
  "entities": ["entity1", "entity2"],
  "key_facts": ["fact1", "fact2"],
  "metadata": {"type": "conversation"}
}`;

    const response = await this.llm.generateCompletion([
      { role: 'user', content: prompt }
    ]);

    try {
      return JSON.parse(response);
    } catch (e) {
      return {
        title: '',
        summary: '',
        categories: [],
        entities: [],
        key_facts: [],
        metadata: { type: "conversation" }
      };
    }
  }

  async embedMemory(content, schema) {
    const embedding = await this.vectorStore.embed(content);
    return {
      embedding,
      schema
    };
  }
}

export class KnowledgeBaseSchema {
  constructor() {
    this.types = {
      conversation: {
        fields: ['participants', 'timestamp', 'topics']
      },
      fact: {
        fields: ['fact', 'source', 'confidence']
      },
      task: {
        fields: ['action', 'result', 'timestamp']
      },
      tool: {
        fields: ['name', 'description', 'dependencies']
      }
    };
  }

  isValidType(type) {
    return this.types[type];
  }

  validateMemory(memory) {
    const typeName = memory.metadata?.type;
    const schema = this.types[typeName];

    if (!schema) return false;

    for (const field of schema.fields) {
      if (!memory[field]) return false;
    }

    return true;
  }

  getSchema(type) {
    return this.types[type];
  }
}