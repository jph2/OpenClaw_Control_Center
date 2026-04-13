import { z } from 'zod';

const schema = z.object({ 
    metadata: z.object({ 
        mainAgents: z.record(z.object({ 
            name: z.string() 
        })).nullish() 
    }).nullish()
});

try { 
    schema.parse({ metadata: { mainAgents: { tars: { name: 'TARS'} } } }); 
    console.log('OK'); 
} catch (e) { 
    console.log(JSON.stringify(e.issues, null, 2)); 
}
