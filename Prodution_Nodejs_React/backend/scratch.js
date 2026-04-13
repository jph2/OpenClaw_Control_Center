const { z } = require('zod');

const ChannelConfigSchema = z.object({
    metadata: z.object({
        mainAgents: z.record(z.object({
            name: z.string(),
            role: z.string().nullish(),
            color: z.string().nullish(),
            defaultSkills: z.array(z.string()).nullish(),
            quote: z.string().nullish()
        })).nullish()
    }).nullish()
}).passthrough();

const unifiedData = {
    metadata: {
        mainAgents: {
            tars: { name: "TARS", role: "Planner", color: "#50e3c2", defaultSkills: ["clawflow"], quote: "Direct" }
        }
    }
};

try {
    ChannelConfigSchema.parse(unifiedData);
    console.log("SUCCESS");
} catch (e) {
    console.log(JSON.stringify(e, null, 2));
}
