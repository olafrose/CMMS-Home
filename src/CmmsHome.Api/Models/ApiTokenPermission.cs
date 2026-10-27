namespace CmmsHome.Api.Models;

// One permission a token is scoped to. Mirrors RolePermission: absence is denial, and the
// key is a catalogue string rather than an enum for the same reason.
//
// A scope row only ever *narrows*. Holding it grants nothing the owner's roles don't also
// grant at the moment of the request.
public class ApiTokenPermission
{
    public Guid ApiTokenId { get; set; }
    public required string Permission { get; set; }
}
