using Newtonsoft.Json.Linq;

namespace Jellyfin.Plugin.FileTransformation;

// The test assembly has major version 3, allowing the real reflection boundary
// to be exercised without installing or modifying any live plugin.
public static class PluginInterface
{
    public static Dictionary<Guid, JObject> Registrations { get; } = new();
    public static void RegisterTransformation(JObject payload) =>
        Registrations.TryAdd(Guid.Parse(payload.Value<string>("id")!), payload);
    public static void RemoveTransformation(Guid id) => Registrations.Remove(id);
}
